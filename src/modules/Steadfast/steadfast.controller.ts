import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import * as steadfastService from './steadfast.service';
import { prisma } from '../../../prisma/client';
import { syncStockForStatusChange } from '../../utils/orderStock';
import AppError from '../../errors/AppError';
import httpStatus from 'http-status';

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

        if (!order) {
            throw new AppError(httpStatus.NOT_FOUND, 'Order not found');
        }

        const shippingInfo = (order.shipping as any) || {};

        // Build item description string from order items
        const itemDescription = (order.orderItems || [])
            .map((item: any) => {
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
    } catch (error: any) {
        next(error);
    }
};

export const getBalance = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await steadfastService.getSteadfastBalance();
        res.status(200).json({ success: true, data: result });
    } catch (error: any) {
        next(error);
    }
};

export const handleWebhook = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const secretToken = process.env.STEADFAST_SECRET_TOKEN;
        if (!secretToken) return res.status(503).send('Webhook not configured');

        // Exact bytes Steadfast sent (captured by express.json verify in app.ts)
        const rawBody: Buffer = Buffer.isBuffer((req as any).rawBody)
            ? (req as any).rawBody
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

        if (event.notification_type === 'delivery_status' && event.invoice) {
            const courierStatus = String(event.status || '').toLowerCase();
            const deliveryCharge = event.delivery_charge;

            // Courier outcome → our order status (final states are never moved backwards).
            const nextStatus =
                courierStatus === 'delivered' || courierStatus === 'partial_delivered' ? 'DELIVERED'
                : courierStatus === 'cancelled' ? 'RETURNED'
                : null;

            const orders = await prisma.order.findMany({ where: { invoice: String(event.invoice) } });
            for (const order of orders) {
                await prisma.$transaction(async (tx) => {
                    const data: any = {
                        courierStatus: event.status,
                        ...(deliveryCharge !== undefined && deliveryCharge !== null && { deliveryCharge: Number(deliveryCharge) }),
                    };
                    const isFinal = ['COMPLETED', 'CANCELED', 'RETURNED'].includes(order.status);
                    if (nextStatus && !isFinal && order.status !== nextStatus) {
                        await syncStockForStatusChange(tx, order, nextStatus); // RETURNED puts stock back once
                        data.status = nextStatus;
                    }
                    await tx.order.update({ where: { id: order.id }, data });
                }, { maxWait: 10000, timeout: 15000 });
            }
        }

        return res.status(200).json({ status: 'success' });
    } catch (error: any) {
        next(error);
    }
};