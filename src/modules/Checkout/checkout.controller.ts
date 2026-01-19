import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import AppError from "../../errors/AppError";
import httpStatus from "http-status";
import { prisma } from "../../../prisma/client";
import { bkashGateway } from "./checkout.service";
import { getClientRedirects, makeInvoice } from "./checkout.utils";

export const CheckoutController = {
    // POST /api/checkout/bkash/create
    create: catchAsync(async (req: Request, res: Response) => {
        const user = (req as any).user || null;

        // const { orderId } = req.body as { orderId: string };
        // if (!orderId) throw new AppError(httpStatus.BAD_REQUEST, "orderId is required");

        // const order = await prisma.order.findUnique({ where: { id: orderId } });
        // if (!order) throw new AppError(httpStatus.NOT_FOUND, "Order not found");
        // if (order.isPaid) throw new AppError(httpStatus.BAD_REQUEST, "Order already paid");

        // /**
        //  * ✅ Security rule:
        //  * - If order has a customerId (logged-in order), only that user (or admin) can pay
        //  * - If order is guest (customerId null), anyone can pay (visitor ok)
        //  */
        // if (order.customerId) {
        //     const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
        //     if (!user?.id && !isAdmin) {
        //         throw new AppError(httpStatus.UNAUTHORIZED, "Login required to pay for this order");
        //     }
        //     if (!isAdmin && user?.id !== order.customerId) {
        //         throw new AppError(httpStatus.FORBIDDEN, "You cannot pay for someone else’s order");
        //     }
        // }

        const { orderId, payToken } = req.body as { orderId: string; payToken: string };
        // console.log("CheckoutController.create called with ", req.body);

        if (!orderId) throw new AppError(httpStatus.BAD_REQUEST, "orderId is required");
        if (!payToken) throw new AppError(httpStatus.BAD_REQUEST, "payToken is required");

        const order = await prisma.order.findUnique({ where: { id: orderId } });
        if (!order) throw new AppError(httpStatus.NOT_FOUND, "Order not found");
        if (order.isPaid) throw new AppError(httpStatus.BAD_REQUEST, "Order already paid");

        // ✅ Anyone can pay, but must have the token
        if (!order.payToken || order.payToken !== payToken) {
            throw new AppError(httpStatus.UNAUTHORIZED, "Invalid payment token");
        }

        const callbackBase = process.env.BKASH_CALLBACK_BASE_URL;
        if (!callbackBase) {
            throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, "BKASH_CALLBACK_BASE_URL missing");
        }

        const invoice = order.invoice || makeInvoice();

        // ✅ Idempotency: if there's already an INITIATED BKASH payment for this order, reuse it
        const existing = await prisma.payment.findFirst({
            where: {
                orderId: order.id,
                provider: "BKASH",
                status: "INITIATED",
                gatewayPaymentId: { not: null },
            },
            orderBy: { createdAt: "desc" },
        });

        if (existing?.gatewayPaymentId) {
            // We cannot reconstruct bkashURL without calling create again,
            // so simplest: create again to get a new bkashURL (allowed) OR store bkashURL in gatewayResponse.
            // We'll create again to return a fresh bkashURL.
        }

        // Create a Payment row now (gateway-agnostic)
        const payment = await prisma.payment.create({
            data: {
                orderId: order.id,
                amount: order.amount,
                provider: "BKASH",
                status: "INITIATED",
                gatewayInvoice: invoice,
                // Optional: store visitor info for tracking (only if you want)
                gatewayStatus: "Initiated",
            },
        });

        const payerRef =
            user?.phone ||
            user?.email ||
            (order.phone ?? "") || // if your order has phone in shipping/customerInfo JSON, you can pull it from there
            "guest";

        const data = await bkashGateway.createPayment({
            amount: order.amount,
            payerReference: payerRef,
            callbackURL: `${callbackBase}/callback`,
            invoice,
        });

        if (!data?.bkashURL || !data?.paymentID) {
            await prisma.payment.update({
                where: { id: payment.id },
                data: { status: "FAILED", gatewayResponse: data || null },
            });
            throw new AppError(httpStatus.BAD_REQUEST, data?.statusMessage || "bKash create payment failed");
        }

        await prisma.payment.update({
            where: { id: payment.id },
            data: {
                gatewayPaymentId: data.paymentID,
                gatewayResponse: data,
            },
        });

        return res.status(200).json({
            success: true,
            bkashURL: data.bkashURL,
            paymentID: data.paymentID,
        });
    }),

    // GET /api/checkout/bkash/callback?paymentID=...&status=success|failure|cancel
    callback: catchAsync(async (req: Request, res: Response) => {
        const { paymentID, status } = req.query as { paymentID?: string; status?: string };
        const { success, fail } = getClientRedirects();

        if (!paymentID) {
            return res.redirect(`${fail}?message=missing_paymentID`);
        }

        const payment = await prisma.payment.findFirst({
            where: { gatewayPaymentId: paymentID, provider: "BKASH" },
        });

        if (!payment) {
            return res.redirect(`${fail}?message=payment_not_found`);
        }

        // ✅ Idempotency guard: callback may hit multiple times
        if (payment.status === "COMPLETED") {
            return res.redirect(success);
        }

        if (status === "cancel" || status === "cancelled") {
            await prisma.payment.update({ where: { id: payment.id }, data: { status: "CANCELLED" } });
            return res.redirect(`${fail}?message=cancelled`);
        }

        if (status === "failure") {
            await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
            return res.redirect(`${fail}?message=failure`);
        }

        if (status !== "success") {
            await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
            return res.redirect(`${fail}?message=unknown_status`);
        }

        // status=success -> Execute payment
        try {
            const exec = await bkashGateway.executePayment(paymentID);

            if (exec?.statusCode === "0000") {
                await prisma.$transaction([
                    prisma.payment.update({
                        where: { id: payment.id },
                        data: {
                            status: "COMPLETED",
                            gatewayTrxId: exec.trxID || null,
                            gatewayStatus: exec.transactionStatus || "Completed",
                            gatewayResponse: exec,
                        },
                    }),
                    prisma.order.update({
                        where: { id: payment.orderId },
                        data: {
                            isPaid: true,
                            method: "BKASH",
                            status: "PROCESSING",
                        },
                    }),
                ]);

                return res.redirect(success);
            }

            // if execute failed -> mark failed
            await prisma.payment.update({
                where: { id: payment.id },
                data: { status: "FAILED", gatewayResponse: exec || null },
            });

            return res.redirect(`${fail}?message=${encodeURIComponent(exec?.statusMessage || "execute_failed")}`);
        } catch (err: any) {
            // If execute has no response/timeouts -> Query payment (recommended by bKash) :contentReference[oaicite:20]{index=20}
            try {
                const q = await bkashGateway.queryPayment(paymentID);

                if (q?.transactionStatus === "Completed") {
                    await prisma.$transaction([
                        prisma.payment.update({
                            where: { id: payment.id },
                            data: {
                                status: "COMPLETED",
                                gatewayTrxId: q.trxID || payment.gatewayTrxId || null,
                                gatewayStatus: q.transactionStatus || "Completed",
                                gatewayResponse: q,
                            },
                        }),
                        prisma.order.update({
                            where: { id: payment.orderId },
                            data: { isPaid: true, method: "BKASH", status: "PROCESSING" },
                        }),
                    ]);
                    return res.redirect(success);
                }

                // Initiated means not completed; user may retry from create payment again :contentReference[oaicite:21]{index=21}
                await prisma.payment.update({
                    where: { id: payment.id },
                    data: { status: "FAILED", gatewayResponse: q || null },
                });
                return res.redirect(`${fail}?message=${encodeURIComponent(q?.transactionStatus || "initiated")}`);
            } catch {
                await prisma.payment.update({
                    where: { id: payment.id },
                    data: { status: "FAILED" },
                });
                return res.redirect(`${fail}?message=${encodeURIComponent(err?.message || "execute_timeout")}`);
            }
        }
    }),

    // POST /api/checkout/bkash/refund/:trxID
    refund: catchAsync(async (req: Request, res: Response) => {
        const { trxID } = req.params;

        const payment = await prisma.payment.findFirst({
            where: { gatewayTrxId: trxID, provider: "BKASH", status: "COMPLETED" },
        });

        if (!payment) throw new AppError(httpStatus.NOT_FOUND, "Payment not found or not completed");

        const refundAmount = payment.amount; // full refund here (you can make partial too)
        const refund = await bkashGateway.refundTransaction({
            paymentId: payment.gatewayPaymentId!,
            trxId: trxID,
            refundAmount,
            sku: "order-refund",
            reason: "customer_refund",
        });

        // docs say check refundTransactionStatus = Completed for success :contentReference[oaicite:22]{index=22}
        const ok =
            refund?.refundTransactionStatus === "Completed" ||
            refund?.statusCode === "0000";

        await prisma.payment.update({
            where: { id: payment.id },
            data: {
                status: ok ? "REFUNDED" : payment.status,
                refundedAmount: ok ? refundAmount : payment.refundedAmount,
                refundTrxId: refund?.refundTrxId || null,
                refundStatus: refund?.refundTransactionStatus || refund?.statusMessage || null,
                gatewayResponse: refund,
            },
        });

        return res.status(ok ? 200 : 400).json({
            success: ok,
            refund,
        });
    }),
};
