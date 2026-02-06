"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CheckoutController = void 0;
const catchAsync_1 = __importDefault(require("../../utils/catchAsync"));
const AppError_1 = __importDefault(require("../../errors/AppError"));
const http_status_1 = __importDefault(require("http-status"));
const client_1 = require("../../../prisma/client");
const checkout_service_1 = require("./checkout.service");
const checkout_utils_1 = require("./checkout.utils");
const discount_service_1 = require("../Discount/discount.service");
exports.CheckoutController = {
    // POST /api/checkout/bkash/create
    create: (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b;
        // ✅ Strong guard: must be a plain object
        if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Invalid request body");
        }
        const user = req.user || null;
        const { orderId, payToken } = req.body;
        if (!orderId || typeof orderId !== "string") {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "orderId is required");
        }
        if (!payToken || typeof payToken !== "string") {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "payToken is required");
        }
        const order = yield client_1.prisma.order.findUnique({ where: { id: orderId } });
        if (!order)
            throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Order not found");
        if (order.isPaid)
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Order already paid");
        // ✅ Guest-friendly security: anyone can pay if they have payToken
        if (!order.payToken || order.payToken !== payToken) {
            throw new AppError_1.default(http_status_1.default.UNAUTHORIZED, "Invalid payment token");
        }
        // ✅ callback base must be domain only
        const callbackBase = process.env.BKASH_CALLBACK_BASE_URL;
        if (!callbackBase) {
            throw new AppError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, "BKASH_CALLBACK_BASE_URL missing");
        }
        const callbackURL = `${callbackBase}/api/checkout/bkash/callback`;
        // ✅ make safe invoice + payer ref (avoid @ . spaces etc)
        const invoice = order.invoice || (0, checkout_utils_1.makeInvoice)();
        const invoiceSafe = String(invoice).replace(/[^0-9a-zA-Z_-]/g, "").slice(0, 50) || (0, checkout_utils_1.makeInvoice)();
        const payerRefRaw = (user === null || user === void 0 ? void 0 : user.phone) || (order === null || order === void 0 ? void 0 : order.phone) || (user === null || user === void 0 ? void 0 : user.email) || "guest";
        const payerReference = String(payerRefRaw).replace(/[^0-9a-zA-Z_-]/g, "").slice(0, 50) || "guest";
        const amount = Number(order.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Invalid order amount");
        }
        // ✅ Idempotency: reuse latest INITIATED payment if exists (optional but good)
        const existing = yield client_1.prisma.payment.findFirst({
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
        let payment = null;
        try {
            // Create payment row first so you can track attempts
            payment = yield client_1.prisma.payment.create({
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
            const data = yield checkout_service_1.bkashGateway.createPayment({
                amount,
                payerReference,
                callbackURL,
                invoice: invoiceSafe,
            });
            // Validate response
            if (!(data === null || data === void 0 ? void 0 : data.bkashURL) || !(data === null || data === void 0 ? void 0 : data.paymentID)) {
                yield client_1.prisma.payment.update({
                    where: { id: payment.id },
                    data: { status: "FAILED", gatewayResponse: data || null },
                });
                throw new AppError_1.default(http_status_1.default.BAD_REQUEST, (data === null || data === void 0 ? void 0 : data.statusMessage) || (data === null || data === void 0 ? void 0 : data.message) || "bKash create payment failed");
            }
            // Save gateway payment id
            yield client_1.prisma.payment.update({
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
        }
        catch (err) {
            // ✅ Never crash if payment was not created
            const status = (_a = err === null || err === void 0 ? void 0 : err.response) === null || _a === void 0 ? void 0 : _a.status;
            const bkashErr = (_b = err === null || err === void 0 ? void 0 : err.response) === null || _b === void 0 ? void 0 : _b.data;
            if (bkashErr || status) {
                console.error("❌ bKash createPayment failed:", status, bkashErr);
            }
            else {
                console.error("❌ Create payment internal error:", err === null || err === void 0 ? void 0 : err.message);
            }
            // If payment exists, mark failed
            if (payment === null || payment === void 0 ? void 0 : payment.id) {
                yield client_1.prisma.payment.update({
                    where: { id: payment.id },
                    data: {
                        status: "FAILED",
                        gatewayResponse: bkashErr || (err === null || err === void 0 ? void 0 : err.message) || null,
                    },
                });
            }
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, (bkashErr === null || bkashErr === void 0 ? void 0 : bkashErr.statusMessage) || (bkashErr === null || bkashErr === void 0 ? void 0 : bkashErr.message) || (err === null || err === void 0 ? void 0 : err.message) || "bKash create payment failed");
        }
    })),
    // GET /api/checkout/bkash/callback?paymentID=...&status=success|failure|cancel
    callback: (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const { paymentID, status } = req.query;
        const { success, fail } = (0, checkout_utils_1.getClientRedirects)();
        if (!paymentID)
            return res.redirect(`${fail}?message=missing_paymentID`);
        const payment = yield client_1.prisma.payment.findFirst({
            where: { gatewayPaymentId: paymentID, provider: "BKASH" },
        });
        if (!payment)
            return res.redirect(`${fail}?message=payment_not_found`);
        if (payment.status === "COMPLETED")
            return res.redirect(success);
        if (status === "cancel" || status === "cancelled") {
            yield client_1.prisma.payment.update({ where: { id: payment.id }, data: { status: "CANCELLED" } });
            return res.redirect(`${fail}?message=cancelled`);
        }
        if (status === "failure") {
            yield client_1.prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
            return res.redirect(`${fail}?message=failure`);
        }
        if (status !== "success") {
            yield client_1.prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
            return res.redirect(`${fail}?message=unknown_status`);
        }
        // status=success -> Execute payment
        try {
            const exec = yield checkout_service_1.bkashGateway.executePayment(paymentID);
            if ((exec === null || exec === void 0 ? void 0 : exec.statusCode) === "0000") {
                yield client_1.prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
                    yield tx.payment.update({
                        where: { id: payment.id },
                        data: {
                            status: "COMPLETED",
                            gatewayTrxId: exec.trxID || null,
                            gatewayStatus: exec.transactionStatus || "Completed",
                            gatewayResponse: exec,
                        },
                    });
                    const order = yield tx.order.update({
                        where: { id: payment.orderId },
                        data: { isPaid: true, method: "BKASH", status: "PROCESSING" },
                    });
                    // ✅ Consume coupon usage ONLY after payment success
                    if (order.coupon) {
                        yield discount_service_1.DiscountServices.consumeDiscountUsageByCode(tx, order.coupon, order.id);
                    }
                }));
                return res.redirect(success);
            }
            yield client_1.prisma.payment.update({
                where: { id: payment.id },
                data: { status: "FAILED", gatewayResponse: exec || null },
            });
            return res.redirect(`${fail}?message=${encodeURIComponent((exec === null || exec === void 0 ? void 0 : exec.statusMessage) || "execute_failed")}`);
        }
        catch (err) {
            try {
                const q = yield checkout_service_1.bkashGateway.queryPayment(paymentID);
                if ((q === null || q === void 0 ? void 0 : q.transactionStatus) === "Completed") {
                    yield client_1.prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
                        yield tx.payment.update({
                            where: { id: payment.id },
                            data: {
                                status: "COMPLETED",
                                gatewayTrxId: q.trxID || payment.gatewayTrxId || null,
                                gatewayStatus: q.transactionStatus || "Completed",
                                gatewayResponse: q,
                            },
                        });
                        const order = yield tx.order.update({
                            where: { id: payment.orderId },
                            data: { isPaid: true, method: "BKASH", status: "PROCESSING" },
                        });
                        // ✅ Consume coupon usage ONLY after payment success
                        if (order.coupon) {
                            yield discount_service_1.DiscountServices.consumeDiscountUsageByCode(tx, order.coupon, order.id);
                        }
                    }));
                    return res.redirect(success);
                }
                yield client_1.prisma.payment.update({
                    where: { id: payment.id },
                    data: { status: "FAILED", gatewayResponse: q || null },
                });
                return res.redirect(`${fail}?message=${encodeURIComponent((q === null || q === void 0 ? void 0 : q.transactionStatus) || "initiated")}`);
            }
            catch (_a) {
                yield client_1.prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
                return res.redirect(`${fail}?message=${encodeURIComponent((err === null || err === void 0 ? void 0 : err.message) || "execute_timeout")}`);
            }
        }
    })),
    // POST /api/checkout/bkash/refund/:trxID
    refund: (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const { trxID } = req.params;
        const payment = yield client_1.prisma.payment.findFirst({
            where: { gatewayTrxId: trxID, provider: "BKASH", status: "COMPLETED" },
        });
        if (!payment)
            throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Payment not found or not completed");
        const refundAmount = payment.amount;
        const refund = yield checkout_service_1.bkashGateway.refundTransaction({
            paymentId: payment.gatewayPaymentId,
            trxId: trxID,
            refundAmount,
            sku: "order-refund",
            reason: "customer_refund",
        });
        const ok = (refund === null || refund === void 0 ? void 0 : refund.refundTransactionStatus) === "Completed" || (refund === null || refund === void 0 ? void 0 : refund.statusCode) === "0000";
        yield client_1.prisma.payment.update({
            where: { id: payment.id },
            data: {
                status: ok ? "REFUNDED" : payment.status,
                refundedAmount: ok ? refundAmount : payment.refundedAmount,
                refundTrxId: (refund === null || refund === void 0 ? void 0 : refund.refundTrxId) || null,
                refundStatus: (refund === null || refund === void 0 ? void 0 : refund.refundTransactionStatus) || (refund === null || refund === void 0 ? void 0 : refund.statusMessage) || null,
                gatewayResponse: refund,
            },
        });
        return res.status(ok ? 200 : 400).json({ success: ok, refund });
    })),
};
