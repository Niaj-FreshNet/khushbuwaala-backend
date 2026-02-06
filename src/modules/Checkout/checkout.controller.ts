import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import AppError from "../../errors/AppError";
import httpStatus from "http-status";
import { prisma } from "../../../prisma/client";
import { bkashGateway } from "./checkout.service";
import { getClientRedirects, makeInvoice } from "./checkout.utils";
import { DiscountServices } from "../Discount/discount.service";

export const CheckoutController = {
  // POST /api/checkout/bkash/create
  create: catchAsync(async (req: Request, res: Response) => {
    // ✅ Strong guard: must be a plain object
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      throw new AppError(httpStatus.BAD_REQUEST, "Invalid request body");
    }

    const user = (req as any).user || null;

    const { orderId, payToken } = req.body as { orderId?: string; payToken?: string };

    if (!orderId || typeof orderId !== "string") {
      throw new AppError(httpStatus.BAD_REQUEST, "orderId is required");
    }
    if (!payToken || typeof payToken !== "string") {
      throw new AppError(httpStatus.BAD_REQUEST, "payToken is required");
    }

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError(httpStatus.NOT_FOUND, "Order not found");
    if (order.isPaid) throw new AppError(httpStatus.BAD_REQUEST, "Order already paid");

    // ✅ Guest-friendly security: anyone can pay if they have payToken
    if (!order.payToken || order.payToken !== payToken) {
      throw new AppError(httpStatus.UNAUTHORIZED, "Invalid payment token");
    }

    // ✅ callback base must be domain only
    const callbackBase = process.env.BKASH_CALLBACK_BASE_URL;
    if (!callbackBase) {
      throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, "BKASH_CALLBACK_BASE_URL missing");
    }

    const callbackURL = `${callbackBase}/api/checkout/bkash/callback`;

    // ✅ make safe invoice + payer ref (avoid @ . spaces etc)
    const invoice = order.invoice || makeInvoice();
    const invoiceSafe = String(invoice).replace(/[^0-9a-zA-Z_-]/g, "").slice(0, 50) || makeInvoice();

    const payerRefRaw = user?.phone || (order as any)?.phone || user?.email || "guest";
    const payerReference =
      String(payerRefRaw).replace(/[^0-9a-zA-Z_-]/g, "").slice(0, 50) || "guest";

    const amount = Number(order.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new AppError(httpStatus.BAD_REQUEST, "Invalid order amount");
    }

    // ✅ Idempotency: reuse latest INITIATED payment if exists (optional but good)
    const existing = await prisma.payment.findFirst({
      where: {
        orderId: order.id,
        provider: "BKASH",
        status: "INITIATED",
        gatewayPaymentId: { not: null },
      },
      orderBy: { createdAt: "desc" },
    });

    // If you want to always create a new payment attempt, ignore existing.
    // We'll create a new INITIATED row each time for clean attempts.
    let payment: any = null;

    try {
      // Create payment row first so you can track attempts
      payment = await prisma.payment.create({
        data: {
          orderId: order.id,
          amount: amount,
          provider: "BKASH",
          status: "INITIATED",
          gatewayInvoice: invoiceSafe,
          gatewayStatus: "Initiated",
        },
      });

      // Call bKash create
      const data = await bkashGateway.createPayment({
        amount,
        payerReference,
        callbackURL,
        invoice: invoiceSafe,
      });

      // Validate response
      if (!data?.bkashURL || !data?.paymentID) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: "FAILED", gatewayResponse: data || null },
        });
        throw new AppError(
          httpStatus.BAD_REQUEST,
          data?.statusMessage || data?.message || "bKash create payment failed"
        );
      }

      // Save gateway payment id
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
    } catch (err: any) {
      // ✅ Never crash if payment was not created
      const status = err?.response?.status;
      const bkashErr = err?.response?.data;

      if (bkashErr || status) {
        console.error("❌ bKash createPayment failed:", status, bkashErr);
      } else {
        console.error("❌ Create payment internal error:", err?.message);
      }

      // If payment exists, mark failed
      if (payment?.id) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: "FAILED",
            gatewayResponse: bkashErr || err?.message || null,
          },
        });
      }

      throw new AppError(
        httpStatus.BAD_REQUEST,
        bkashErr?.statusMessage || bkashErr?.message || err?.message || "bKash create payment failed"
      );
    }
  }),

  // GET /api/checkout/bkash/callback?paymentID=...&status=success|failure|cancel
  callback: catchAsync(async (req: Request, res: Response) => {
    const { paymentID, status } = req.query as { paymentID?: string; status?: string };
    const { success, fail } = getClientRedirects();

    if (!paymentID) return res.redirect(`${fail}?message=missing_paymentID`);

    const payment = await prisma.payment.findFirst({
      where: { gatewayPaymentId: paymentID, provider: "BKASH" },
    });

    if (!payment) return res.redirect(`${fail}?message=payment_not_found`);

    if (payment.status === "COMPLETED") return res.redirect(success);

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
        await prisma.$transaction(async (tx) => {
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: "COMPLETED",
              gatewayTrxId: exec.trxID || null,
              gatewayStatus: exec.transactionStatus || "Completed",
              gatewayResponse: exec,
            },
          });

          const order = await tx.order.update({
            where: { id: payment.orderId },
            data: { isPaid: true, method: "BKASH", status: "PROCESSING" },
          });

          // ✅ Consume coupon usage ONLY after payment success
          if (order.coupon) {
            await DiscountServices.consumeDiscountUsageByCode(tx, order.coupon, order.id);
          }
        });

        return res.redirect(success);
      }

      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED", gatewayResponse: exec || null },
      });

      return res.redirect(`${fail}?message=${encodeURIComponent(exec?.statusMessage || "execute_failed")}`);
    } catch (err: any) {
      try {
        const q = await bkashGateway.queryPayment(paymentID);

        if (q?.transactionStatus === "Completed") {
          await prisma.$transaction(async (tx) => {
            await tx.payment.update({
              where: { id: payment.id },
              data: {
                status: "COMPLETED",
                gatewayTrxId: q.trxID || payment.gatewayTrxId || null,
                gatewayStatus: q.transactionStatus || "Completed",
                gatewayResponse: q,
              },
            });

            const order = await tx.order.update({
              where: { id: payment.orderId },
              data: { isPaid: true, method: "BKASH", status: "PROCESSING" },
            });

            // ✅ Consume coupon usage ONLY after payment success
            if (order.coupon) {
              await DiscountServices.consumeDiscountUsageByCode(tx, order.coupon, order.id);
            }
          });

          return res.redirect(success);
        }

        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: "FAILED", gatewayResponse: q || null },
        });

        return res.redirect(`${fail}?message=${encodeURIComponent(q?.transactionStatus || "initiated")}`);
      } catch {
        await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
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

    const refundAmount = payment.amount;
    const refund = await bkashGateway.refundTransaction({
      paymentId: payment.gatewayPaymentId!,
      trxId: trxID,
      refundAmount,
      sku: "order-refund",
      reason: "customer_refund",
    });

    const ok = refund?.refundTransactionStatus === "Completed" || refund?.statusCode === "0000";

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

    return res.status(ok ? 200 : 400).json({ success: ok, refund });
  }),
};
