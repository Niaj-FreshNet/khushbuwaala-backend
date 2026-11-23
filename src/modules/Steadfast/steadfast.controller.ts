import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import * as steadfastService from './steadfast.service';
import { prisma } from '../../../prisma/client';
import { applyCourierOutcome, getLastCourierSync, runCourierSync } from './courierSync';
import AppError from '../../errors/AppError';
import httpStatus from 'http-status';
import { asAddress } from '../../types/records';
import type { Prisma } from '@prisma/client';

/** A parcel as stored on a CourierPayout (courierSync.ts) */
type StoredParcel = { consignmentId?: number; invoice?: string | null; codAmount?: number; status?: string; orderId?: string | null };

export const sendOrderToSteadfast = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { orderId } = req.params;

        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: {
                orderItems: {
                    include: {
                        product: { select: { name: true } },
                        variant: true,
                    },
                },
            },
        });

        const actor = req.user;
        if (order && actor?.role === 'SALESMAN' && String(order.salesmanId || '') !== String(actor.id)) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        if (!order) {
            throw new AppError(httpStatus.NOT_FOUND, 'Order not found');
        }
        // Booking twice creates a second parcel and a second delivery charge (it happened: #239839,
        // #529134). Re-booking needs { force: true }, e.g. after Steadfast cancelled the first one.
        if (order.consignmentId && !(req.body && req.body.force === true)) {
            throw new AppError(httpStatus.CONFLICT, `Already booked with Steadfast (consignment ${order.consignmentId}). Book again only if that parcel was cancelled.`);
        }

        const shippingInfo = asAddress(order.shipping);

        // Build item description string from order items
        const itemDescription = (order.orderItems || [])
            .map((item) => {
                const pName = item.product?.name || 'Product';
                const size = item.size ? `${item.size} ${item.unit || ''}` : '';
                return `${item.quantity}x ${pName} ${size}`.trim();
            })
            .join(', ');

        // Fragrance default safety notes
        const defaultNote = "- Glass bottles\n- Liquid inside\n- Handle carefully";

        // Combine customer/order additional notes with default note if present
        const orderNote = order.additionalNotes?.trim();
        const finalNote = orderNote
            ? `${orderNote}\n${defaultNote}`
            : defaultNote;

        const payload = {
            invoice: order.invoice,
            recipient_name: shippingInfo.name || order.name || 'Valued Customer',
            recipient_phone: shippingInfo.phone || order.phone || '',
            recipient_address: shippingInfo.address || order.address || '',
            cod_amount: order.isPaid ? 0 : Number(order.amount || 0),
            note: finalNote,
            item_description: itemDescription,
            total_lot: order.orderItems.length || 1,
            weight: '0.1',
        };

        const steadfastResponse = await steadfastService.createSteadfastOrder(payload);

        if (steadfastResponse?.consignment) {
            await prisma.order.update({
                where: { id: orderId },
                data: {
                    consignmentId: Number(steadfastResponse.consignment.consignment_id),
                    trackingCode: steadfastResponse.consignment.tracking_code,
                    trackingLink: steadfastResponse.consignment.tracking_link,
                    deliveryCharge: Number(steadfastResponse.consignment.delivery_charge || 0),
                    courierStatus: steadfastResponse.consignment.status || 'in_review',
                    status: 'SHIPPED',
                },
            });
        }

        res.status(200).json({
            success: true,
            message: 'Order successfully sent to Steadfast',
            data: steadfastResponse,
        });
    } catch (error) {
        next(error);
    }
};

export const getBalance = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await steadfastService.getSteadfastBalance();
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
};

export const handleWebhook = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const secretToken = process.env.STEADFAST_SECRET_TOKEN;
        if (!secretToken) return res.status(503).send('Webhook not configured');

        // Exact bytes Steadfast sent (captured by express.json verify in app.ts)
        const rawBody: Buffer = Buffer.isBuffer(req.rawBody)
            ? req.rawBody
            : Buffer.from(JSON.stringify(req.body ?? {}));

        const safeEqual = (a: string, b: string) =>
            a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

        // Accept an HMAC-SHA256 signature of the body, or a Bearer token equal to the secret.
        const signature = String(req.headers['x-signature'] || '');
        const expectedSignature = crypto.createHmac('sha256', secretToken).update(rawBody).digest('hex');
        const bearer = String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
        if (!(signature && safeEqual(signature, expectedSignature)) && !(bearer && safeEqual(bearer, secretToken))) {
            return res.status(401).send('Unauthorized webhook signature');
        }

        const event = req.body || {};

        // delivery_status carries the outcome; tracking_update only a message (courier status kept).
        if (event.invoice || event.consignment_id) {
            const where: Prisma.OrderWhereInput = event.invoice
                ? { invoice: String(event.invoice).replace(/^#/, '').trim() }
                : { consignmentId: Number(event.consignment_id) };
            const orders = await prisma.order.findMany({ where, select: { id: true } });
            for (const o of orders) {
                if (event.notification_type === 'tracking_update' || !event.status) {
                    await prisma.order.update({ where: { id: o.id }, data: { courierSyncedAt: new Date() } });
                    continue;
                }
                // Same rules as the status and payout sync (courierSync.ts, D-025/D-026)
                await applyCourierOutcome(o.id, {
                    status: String(event.status),
                    codAmount: event.cod_amount,
                    deliveryCharge: event.delivery_charge,
                    consignmentId: event.consignment_id ? Number(event.consignment_id) : null,
                });
            }
        }

        return res.status(200).json({ status: 'success' });
    } catch (error) {
        next(error);
    }
};

// ---- Courier settlement (D-026) ----
export const syncCourier = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const who = req.user?.name || req.user?.email || 'staff';
        const result = await runCourierSync(`manual (${who})`, { full: req.body?.full === true });
        res.status(result.ok ? 200 : 502).json({ success: result.ok, message: result.ok ? 'Synced with Steadfast' : result.error, data: result });
    } catch (error) {
        next(error);
    }
};

export const lastCourierSync = async (_req: Request, res: Response) => {
    res.status(200).json({ success: true, data: getLastCourierSync() });
};

export const getPayouts = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
        const [rows, total, sums] = await Promise.all([
            prisma.courierPayout.findMany({ orderBy: [{ paidAt: 'desc' }, { courierCreatedAt: 'desc' }], skip: (page - 1) * limit, take: limit }),
            prisma.courierPayout.count(),
            prisma.courierPayout.aggregate({ _sum: { amount: true, charges: true, dueBills: true, total: true, parcelCount: true } }),
        ]);
        // Our invoice + status for every matched parcel on this page
        const parcelsOf = (r: (typeof rows)[number]) => (Array.isArray(r.parcels) ? (r.parcels as StoredParcel[]) : []);
        const ids = [...new Set(rows.flatMap((r) => parcelsOf(r).map((p) => p.orderId).filter((id): id is string => !!id)))];
        const orders = await prisma.order.findMany({
            where: { id: { in: ids } },
            select: { id: true, invoice: true, status: true, isPaid: true, amount: true, courierReview: true },
        });
        const byId = new Map(orders.map((o) => [o.id, o]));
        const data = rows.map((r) => ({
            ...r,
            parcels: parcelsOf(r).map((p) => ({ ...p, order: p.orderId ? byId.get(p.orderId) || null : null })),
        }));
        res.status(200).json({
            success: true,
            meta: { page, limit, total, totalPage: Math.ceil(total / limit) },
            totals: sums._sum,
            lastSync: getLastCourierSync(),
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const getCourierReview = async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await prisma.order.findMany({
            where: { courierReview: { not: null } },
            select: { id: true, invoice: true, status: true, isPaid: true, amount: true, method: true, courierStatus: true, courierCodCollected: true, courierPayoutId: true, courierReview: true, orderTime: true, name: true },
            orderBy: { orderTime: 'desc' },
        });
        res.status(200).json({ success: true, data: data.filter((o) => o.courierReview) });
    } catch (error) {
        next(error);
    }
};

/** A person checked a review note: clear it (the order itself is edited as usual). */
export const resolveCourierReview = async (req: Request, res: Response, next: NextFunction) => {
    try {
        await prisma.order.update({ where: { id: req.params.orderId }, data: { courierReview: null } });
        res.status(200).json({ success: true, message: 'Marked as checked' });
    } catch (error) {
        next(error);
    }
};
