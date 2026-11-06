import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import * as steadfastService from './steadfast.service';
import { prisma } from '../../../prisma/client';
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
        const signature = req.headers['x-signature'] as string;
        const secretToken = process.env.STEADFAST_SECRET_TOKEN;

        const rawBody = (req as any).rawBody || Buffer.from(JSON.stringify(req.body));
        const expectedSignature = crypto
            .createHmac('sha256', secretToken as string)
            .update(rawBody)
            .digest('hex');

        if (
            !signature ||
            signature.length !== expectedSignature.length ||
            !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
        ) {
            return res.status(401).send('Unauthorized webhook signature');
        }

        const event = req.body;

        if (event.notification_type === 'delivery_status') {
            const { invoice, status, delivery_charge } = event;

            await prisma.order.updateMany({
                where: { invoice },
                data: {
                    courierStatus: status,
                    ...(delivery_charge !== undefined ? { deliveryCharge: Number(delivery_charge) } : {}),
                },
            });
        }

        return res.status(200).json({ status: 'success' });
    } catch (error: any) {
        next(error);
    }
};