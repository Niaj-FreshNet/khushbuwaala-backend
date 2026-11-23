import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import AppError from "../../errors/AppError";
import httpStatus from "http-status";
import { prisma } from "../../../prisma/client";
import { dgepayGateway, innerReply, type DgepayReply } from "./checkout.service";
import { makeInvoice } from "./checkout.utils";
import { DiscountServices } from "../Discount/discount.service";
import { sendOrderConfirmationEmail, sendOrderNotificationToAdmin } from "../../helpers/emailSender/emails";
import { sendMetaCapiPurchase } from "../Order/order.service";
import { snapshotOrderCosts } from "../Finance/finance.service";
import { errorMessage, httpErrorOf } from '../../utils/errorInfo';
import { asAddress } from '../../types/records';
import type { Prisma } from '@prisma/client';

export const CheckoutController = {
  // ==========================================
  // DGePay Gateway Methods
  // ==========================================

  // POST /api/checkout/dgepay/create
  createDgepay: catchAsync(async (req: Request, res: Response) => {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      throw new AppError(httpStatus.BAD_REQUEST, "Invalid request body");
    }

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

    if (!order.payToken || order.payToken !== payToken) {
      throw new AppError(httpStatus.UNAUTHORIZED, "Invalid payment token");
    }

    const callbackBase = process.env.DGEPAY_CALLBACK_BASE_URL;
    if (!callbackBase) {
      throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, "DGEPAY_CALLBACK_BASE_URL missing");
    }

    const redirect_url = `${callbackBase}/api/checkout/dgepay/callback`;
    const invoiceSafe = String(order.invoice || makeInvoice()).replace(/[^0-9a-zA-Z_-]/g, "").slice(0, 50);
    const amount = Number(order.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new AppError(httpStatus.BAD_REQUEST, "Invalid order amount");
    }

    const rawPhone =
      asAddress(order.shipping).phone ||
      asAddress(order.billing).phone ||
      order.phone ||
      "01700000000";

    const cleanPhone = rawPhone.replace(/\D/g, "").slice(-11);

    // Numeric transaction ID
    const numericTxnId = `${Date.now()}${Math.floor(10000 + Math.random() * 90000)}`;

    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        amount: amount,
        provider: "DGEPAY",
        status: "INITIATED",
        gatewayInvoice: invoiceSafe,
        gatewayPaymentId: numericTxnId,
        gatewayStatus: "Initiated",
      },
    });

    try {
      const response = await dgepayGateway.initiatePayment({
        amount,
        redirect_url,
        unique_txn_id: numericTxnId,
        note: `Order Payment ${invoiceSafe}`,
        payee_information: {
          dial_code: "+88",
          phone_number: cleanPhone,
        },
        meta_data: {
          custom_field_1: String(order.id),
          custom_field_2: invoiceSafe,
          custom_field_3: String(payment.id),
        },
      });

      // ✅ Extracts webview_url from response.data.webview_url
      const inner = innerReply(response);
      const paymentUrl =
        inner?.webview_url ||
        response?.webview_url ||
        inner?.payment_url ||
        inner?.redirect_url ||
        response?.payment_url ||
        response?.redirect_url ||
        response?.url;

      if (!paymentUrl) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: "FAILED", gatewayResponse: response as Prisma.InputJsonValue },
        });

        const errorMsg =
          (Array.isArray(response?.error) ? response.error.join(", ") : null) ||
          response?.message ||
          inner?.message ||
          "DGePay payment initialization failed";

        throw new AppError(httpStatus.BAD_REQUEST, errorMsg);
      }

      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          gatewayResponse: response as Prisma.InputJsonValue,
        },
      });

      return res.status(200).json({
        success: true,
        paymentUrl,
        transactionId: numericTxnId,
      });
    } catch (err) {
      console.error("❌ DGePay Exception:", httpErrorOf(err).data || errorMessage(err));

      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED", gatewayResponse: httpErrorOf(err).data || errorMessage(err) },
      });

      throw new AppError(
        httpStatus.BAD_REQUEST,
        httpErrorOf(err).message || errorMessage(err) || "DGePay initialization error"
      );
    }
  }),

  // POST & GET /api/checkout/dgepay/callback
  callbackDgepay: catchAsync(async (req: Request, res: Response) => {
    const successUrl = process.env.DGEPAY_SUCCESS_REDIRECT || `${process.env.CLIENT_URL}/thank-you`;
    const failUrl = process.env.DGEPAY_FAIL_REDIRECT || `${process.env.CLIENT_URL}/error`;

    let payload: DgepayReply | undefined = req.body && typeof req.body === "object" ? (req.body as DgepayReply) : undefined;

    if (typeof req.body === "string" && req.body.length > 20) {
      try {
        payload = dgepayGateway.decryptPayload(req.body);
      } catch {
        // Fall back to query or regular body
      }
    }

    const unique_txn_id = payload?.unique_txn_id || (req.query?.unique_txn_id as string);

    if (!unique_txn_id) {
      return res.redirect(`${failUrl}?message=missing_txn_id`);
    }

    // DGePay sends back the transaction id we gave it (Payment.gatewayPaymentId). This looked up
    // Payment.id instead, so no payment was ever confirmed automatically (all 23 stayed "Initiated").
    const txnId = String(unique_txn_id);
    const payment = await prisma.payment.findFirst({
      where: { OR: [{ gatewayPaymentId: txnId }, ...(/^[a-f0-9]{24}$/i.test(txnId) ? [{ id: txnId }] : [])] },
    });

    if (!payment) {
      return res.redirect(`${failUrl}?message=payment_not_found`);
    }

    if (payment.status === "COMPLETED") {
      return res.redirect(`${successUrl}?order=${payment.orderId}`);
    }

    try {
      // ask DGePay with its own transaction id
      const statusRes = await dgepayGateway.checkTransactionStatus(payment.gatewayPaymentId || txnId);
      const txnData = innerReply(statusRes);

      // Only an explicit success counts as paid. (`statusRes.status === 200` only meant the status
      // API answered, so failed or abandoned payments could be marked paid.) Clearly failed →
      // FAILED; anything unclear → left pending for review, never cancelled or marked paid.
      const reported = [txnData?.transaction_status, txnData?.txn_status, txnData?.status, statusRes?.transaction_status]
        .filter((v) => typeof v === "string")
        .map((v) => String(v).toUpperCase());
      const reportedAmount = Number(txnData?.amount ?? txnData?.txn_amount ?? txnData?.paid_amount ?? txnData?.total_amount);
      const amountOk = !Number.isFinite(reportedAmount) || reportedAmount <= 0 || reportedAmount + 1 >= Number(payment.amount);
      const isSuccess = reported.some((s) => ["SUCCESS", "SUCCESSFUL", "COMPLETED", "PAID"].includes(s)) && amountOk;
      const isFailed = reported.some((s) => ["FAILED", "FAIL", "CANCELLED", "CANCELED", "DECLINED", "EXPIRED", "REJECTED"].includes(s));

      if (isSuccess) {
        const completedOrder = await prisma.$transaction(async (tx) => {
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: "COMPLETED",
              gatewayTrxId: txnData?.bank_txn_id || txnData?.dgepay_txn_id || unique_txn_id,
              gatewayStatus: "COMPLETED",
              gatewayResponse: txnData as Prisma.InputJsonValue,
            },
          });

          const order = await tx.order.update({
            where: { id: payment.orderId as string },
            data: { isPaid: true, method: "DGEPAY", status: "PROCESSING" },
            include: {
              customer: { select: { id: true, name: true, email: true, phone: true } },
              orderItems: {
                include: { product: true, variant: true },
              },
            },
          });

          if (order.coupon) {
            await DiscountServices.consumeDiscountUsageByCode(tx, order.coupon, order.id);
          }
          return order;
        });
        const ship = asAddress(completedOrder.shipping);
        const bill = asAddress(completedOrder.billing);

        // ✅ Trigger Emails & Server CAPI Purchase upon verified successful payment
        const customerEmail = ship.email || bill.email || completedOrder.customer?.email || completedOrder.email;

        const customerPhone = ship.phone || bill.phone || completedOrder.customer?.phone || completedOrder.phone;

        if (customerEmail && !customerEmail.includes('@khushbuwaala.local')) {
          sendOrderConfirmationEmail(customerEmail, completedOrder).catch((e) =>
            console.error("DGePay confirmation email error:", e.message)
          );
        }

        const adminEmail = process.env.ADMIN_EMAIL || "khushbuwaala@gmail.com";
        if (adminEmail) {
          sendOrderNotificationToAdmin(adminEmail, {
            ...completedOrder,
            email: customerEmail || 'N/A',
            address: ship.address || completedOrder.address,
            district: ship.district || '',
            phone: customerPhone || 'N/A',
            date: new Date().toLocaleDateString('en-GB'),
            note: completedOrder.additionalNotes,
            cartItems: (completedOrder.orderItems || []).map((oi) => ({
              productName: oi.product?.name || 'Product',
              productImageUrls: oi.product?.primaryImage ? [oi.product.primaryImage] : [],
              size: oi.variant?.size ? `${oi.variant.size} ${oi.variant.unit || ''}`.trim() : 'Standard',
              quantity: oi.quantity,
              price: Number(oi.price || 0),
            })),
          }).catch((e) => console.error("Admin notification email error:", e.message));
        }

        // ✅ Fire Server-Side Meta CAPI Purchase with the exact same order ID / event_id (`kw_${orderId}`)
        sendMetaCapiPurchase(completedOrder, customerEmail ?? undefined, customerPhone ?? undefined).catch((err) =>
          console.error("❌ Gateway CAPI Dispatch Error:", err)
        );

        // 💸 FREEZE THE FINANCIAL COSTS NOW THAT PAYMENT IS SECURED 💸
        snapshotOrderCosts(completedOrder.id).catch((err) =>
          console.error('❌ Failed to snapshot order costs from Gateway:', err)
        );

        return res.redirect(`${successUrl}?order=${payment.orderId}`);
      }

      if (!isFailed) {
        // Unclear answer (pending, unknown format, or amount lower than the order): keep the
        // order open and the payment INITIATED, save the gateway reply for review.
        console.warn(`[dgepay] payment ${payment.id} not confirmed (status ${reported.join("/") || "none"}, amount ${reportedAmount}) - left for review`);
        await prisma.payment.update({
          where: { id: payment.id },
          data: { gatewayStatus: "PENDING_REVIEW", gatewayResponse: txnData as Prisma.InputJsonValue },
        });
        return res.redirect(`${failUrl}?message=payment_pending`);
      }

      // 🔴 AUTO-CANCEL ON FAILED PAYMENT STATUS
      await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: "FAILED", gatewayResponse: txnData as Prisma.InputJsonValue },
        });

        await tx.order.update({
          where: { id: payment.orderId as string },
          data: { status: "CANCELED" },
        });
      });

      return res.redirect(`${failUrl}?message=payment_failed`);
    } catch (err) {
      // Could not reach/verify with the gateway: the customer may well have paid, so do NOT
      // cancel. Keep it open for review (it used to cancel the order).
      console.error(`[dgepay] verification error for payment ${payment.id}:`, errorMessage(err));
      await prisma.payment.update({
        where: { id: payment.id },
        data: { gatewayStatus: "VERIFY_ERROR", gatewayResponse: { error: String(errorMessage(err) || err) } },
      }).catch(() => {});

      return res.redirect(`${failUrl}?message=verification_error`);
    }
  }),
};