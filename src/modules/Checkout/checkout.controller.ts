import { Request, Response } from "express";
import catchAsync from "../../utils/catchAsync";
import AppError from "../../errors/AppError";
import httpStatus from "http-status";
import { prisma } from "../../../prisma/client";
import { dgepayGateway } from "./checkout.service";
import { getClientRedirects, makeInvoice } from "./checkout.utils";
import { DiscountServices } from "../Discount/discount.service";
import { sendOrderConfirmationEmail, sendOrderNotificationToAdmin } from "../../helpers/emailSender/emails";

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
      (order as any)?.shipping?.phone ||
      (order as any)?.billing?.phone ||
      (order as any)?.phone ||
      "01700000000";

    const cleanPhone = rawPhone.replace(/\D/g, "").slice(-11);

    // Numeric transaction ID
    const numericTxnId = `${Date.now()}${Math.floor(10000 + Math.random() * 90000)}`;

    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        amount: amount,
        provider: "DGEPAY" as any,
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
      const paymentUrl =
        response?.data?.webview_url ||
        response?.webview_url ||
        response?.data?.payment_url ||
        response?.data?.redirect_url ||
        response?.payment_url ||
        response?.redirect_url ||
        response?.url;

      if (!paymentUrl) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: "FAILED", gatewayResponse: response },
        });

        const errorMsg =
          (Array.isArray(response?.error) ? response.error.join(", ") : null) ||
          response?.message ||
          response?.data?.message ||
          "DGePay payment initialization failed";

        throw new AppError(httpStatus.BAD_REQUEST, errorMsg);
      }

      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          gatewayResponse: response,
        },
      });

      return res.status(200).json({
        success: true,
        paymentUrl,
        transactionId: numericTxnId,
      });
    } catch (err: any) {
      console.error("❌ DGePay Exception:", err?.response?.data || err?.message);

      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED", gatewayResponse: err?.response?.data || err?.message },
      });

      throw new AppError(
        httpStatus.BAD_REQUEST,
        err?.response?.data?.message || err?.message || "DGePay initialization error"
      );
    }
  }),

  // POST & GET /api/checkout/dgepay/callback
  callbackDgepay: catchAsync(async (req: Request, res: Response) => {
    const successUrl = process.env.DGEPAY_SUCCESS_REDIRECT || `${process.env.CLIENT_URL}/thank-you`;
    const failUrl = process.env.DGEPAY_FAIL_REDIRECT || `${process.env.CLIENT_URL}/error`;

    let payload: any = req.body;

    if (typeof req.body === "string" && req.body.length > 20) {
      try {
        payload = dgepayGateway.decryptPayload(req.body);
      } catch (e) {
        // Fall back to query or regular body
      }
    }

    const unique_txn_id = payload?.unique_txn_id || (req.query?.unique_txn_id as string);

    if (!unique_txn_id) {
      return res.redirect(`${failUrl}?message=missing_txn_id`);
    }

    const payment = await prisma.payment.findUnique({
      where: { id: unique_txn_id },
    });

    if (!payment) {
      return res.redirect(`${failUrl}?message=payment_not_found`);
    }

    if (payment.status === "COMPLETED") {
      return res.redirect(`${successUrl}?order=${payment.orderId}`);
    }

    try {
      const statusRes = await dgepayGateway.checkTransactionStatus(unique_txn_id);
      const txnData = statusRes?.data || statusRes;
      const isSuccess =
        txnData?.transaction_status === "SUCCESS" ||
        txnData?.status === "SUCCESS" ||
        statusRes?.status === 200;

      if (isSuccess) {
        let completedOrder: any = null;

        await prisma.$transaction(async (tx) => {
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: "COMPLETED",
              gatewayTrxId: txnData?.bank_txn_id || txnData?.dgepay_txn_id || unique_txn_id,
              gatewayStatus: "COMPLETED",
              gatewayResponse: txnData,
            },
          });

          completedOrder = await tx.order.update({
            where: { id: payment.orderId },
            data: { isPaid: true, method: "DGEPAY", status: "PROCESSING" },
            include: {
              orderItems: {
                include: { product: true, variant: true },
              },
            },
          });

          if (completedOrder.coupon) {
            await DiscountServices.consumeDiscountUsageByCode(tx, completedOrder.coupon, completedOrder.id);
          }
        });

        // ✅ Send Customer Confirmation Email for Online Payment
        const customerEmail =
          completedOrder?.shipping?.email ||
          completedOrder?.billing?.email ||
          completedOrder?.customerInfo?.email ||
          completedOrder?.email;

        if (customerEmail && !customerEmail.includes('@khushbuwaala.local')) {
          sendOrderConfirmationEmail(customerEmail, completedOrder).catch((e) =>
            console.error("DGePay confirmation email error:", e.message)
          );
        }

        // ✅ Send Admin Alert for Online Payment
        const adminEmail = process.env.ADMIN_EMAIL || "khushbuwaala@gmail.com";
        if (adminEmail) {
          sendOrderNotificationToAdmin(adminEmail, {
            ...completedOrder,
            email: customerEmail || 'N/A',
            address: (completedOrder.shipping as any)?.address || completedOrder.address,
            zipcode: (completedOrder.shipping as any)?.district || '',
            phone: (completedOrder.shipping as any)?.phone || completedOrder.phone,
            date: new Date().toLocaleDateString('en-GB'),
            note: completedOrder.additionalNotes,
            cartItems: (completedOrder.orderItems || []).map((oi: any) => ({
              productName: oi.product?.name || 'Product',
              productImageUrls: [oi.product?.primaryImage],
              size: oi.variant?.size ? `${oi.variant.size} ${oi.variant.unit}` : 'Standard',
              color: 'N/A',
              quantity: oi.quantity,
              price: oi.price,
            })),
          }).catch((e) =>
            console.error("Admin notification email error:", e.message)
          );
        }

        return res.redirect(`${successUrl}?order=${payment.orderId}`);
      }

      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED", gatewayResponse: txnData },
      });

      return res.redirect(`${failUrl}?message=payment_failed`);
    } catch (err: any) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED", gatewayResponse: err?.message },
      });
      return res.redirect(`${failUrl}?message=verification_error`);
    }
  }),
};