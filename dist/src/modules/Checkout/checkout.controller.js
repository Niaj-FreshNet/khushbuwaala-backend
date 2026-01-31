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
exports.CheckoutController = {
    // POST /api/checkout/bkash/create
    create: (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        const user = req.user || null;
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
        const { orderId, payToken } = req.body;
        // console.log("CheckoutController.create called with ", req.body);
        if (!orderId)
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "orderId is required");
        if (!payToken)
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "payToken is required");
        const order = yield client_1.prisma.order.findUnique({ where: { id: orderId } });
        if (!order)
            throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Order not found");
        if (order.isPaid)
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Order already paid");
        // ✅ Anyone can pay, but must have the token
        if (!order.payToken || order.payToken !== payToken) {
            throw new AppError_1.default(http_status_1.default.UNAUTHORIZED, "Invalid payment token");
        }
        const callbackBase = process.env.BKASH_CALLBACK_BASE_URL;
        if (!callbackBase) {
            throw new AppError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, "BKASH_CALLBACK_BASE_URL missing");
        }
        const invoice = order.invoice || (0, checkout_utils_1.makeInvoice)();
        // ✅ Idempotency: if there's already an INITIATED BKASH payment for this order, reuse it
        const existing = yield client_1.prisma.payment.findFirst({
            where: {
                orderId: order.id,
                provider: "BKASH",
                status: "INITIATED",
                gatewayPaymentId: { not: null },
            },
            orderBy: { createdAt: "desc" },
        });
        if (existing === null || existing === void 0 ? void 0 : existing.gatewayPaymentId) {
            // We cannot reconstruct bkashURL without calling create again,
            // so simplest: create again to get a new bkashURL (allowed) OR store bkashURL in gatewayResponse.
            // We'll create again to return a fresh bkashURL.
        }
        // Create a Payment row now (gateway-agnostic)
        const payment = yield client_1.prisma.payment.create({
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
        const payerRef = (user === null || user === void 0 ? void 0 : user.phone) ||
            (user === null || user === void 0 ? void 0 : user.email) ||
            ((_a = order.phone) !== null && _a !== void 0 ? _a : "") || // if your order has phone in shipping/customerInfo JSON, you can pull it from there
            "guest";
        const data = yield checkout_service_1.bkashGateway.createPayment({
            amount: order.amount,
            payerReference: payerRef,
            callbackURL: `${callbackBase}/callback`,
            invoice,
        });
        if (!(data === null || data === void 0 ? void 0 : data.bkashURL) || !(data === null || data === void 0 ? void 0 : data.paymentID)) {
            yield client_1.prisma.payment.update({
                where: { id: payment.id },
                data: { status: "FAILED", gatewayResponse: data || null },
            });
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, (data === null || data === void 0 ? void 0 : data.statusMessage) || "bKash create payment failed");
        }
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
    })),
    // GET /api/checkout/bkash/callback?paymentID=...&status=success|failure|cancel
    callback: (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const { paymentID, status } = req.query;
        const { success, fail } = (0, checkout_utils_1.getClientRedirects)();
        if (!paymentID) {
            return res.redirect(`${fail}?message=missing_paymentID`);
        }
        const payment = yield client_1.prisma.payment.findFirst({
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
                yield client_1.prisma.$transaction([
                    client_1.prisma.payment.update({
                        where: { id: payment.id },
                        data: {
                            status: "COMPLETED",
                            gatewayTrxId: exec.trxID || null,
                            gatewayStatus: exec.transactionStatus || "Completed",
                            gatewayResponse: exec,
                        },
                    }),
                    client_1.prisma.order.update({
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
            yield client_1.prisma.payment.update({
                where: { id: payment.id },
                data: { status: "FAILED", gatewayResponse: exec || null },
            });
            return res.redirect(`${fail}?message=${encodeURIComponent((exec === null || exec === void 0 ? void 0 : exec.statusMessage) || "execute_failed")}`);
        }
        catch (err) {
            // If execute has no response/timeouts -> Query payment (recommended by bKash) :contentReference[oaicite:20]{index=20}
            try {
                const q = yield checkout_service_1.bkashGateway.queryPayment(paymentID);
                if ((q === null || q === void 0 ? void 0 : q.transactionStatus) === "Completed") {
                    yield client_1.prisma.$transaction([
                        client_1.prisma.payment.update({
                            where: { id: payment.id },
                            data: {
                                status: "COMPLETED",
                                gatewayTrxId: q.trxID || payment.gatewayTrxId || null,
                                gatewayStatus: q.transactionStatus || "Completed",
                                gatewayResponse: q,
                            },
                        }),
                        client_1.prisma.order.update({
                            where: { id: payment.orderId },
                            data: { isPaid: true, method: "BKASH", status: "PROCESSING" },
                        }),
                    ]);
                    return res.redirect(success);
                }
                // Initiated means not completed; user may retry from create payment again :contentReference[oaicite:21]{index=21}
                yield client_1.prisma.payment.update({
                    where: { id: payment.id },
                    data: { status: "FAILED", gatewayResponse: q || null },
                });
                return res.redirect(`${fail}?message=${encodeURIComponent((q === null || q === void 0 ? void 0 : q.transactionStatus) || "initiated")}`);
            }
            catch (_a) {
                yield client_1.prisma.payment.update({
                    where: { id: payment.id },
                    data: { status: "FAILED" },
                });
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
        const refundAmount = payment.amount; // full refund here (you can make partial too)
        const refund = yield checkout_service_1.bkashGateway.refundTransaction({
            paymentId: payment.gatewayPaymentId,
            trxId: trxID,
            refundAmount,
            sku: "order-refund",
            reason: "customer_refund",
        });
        // docs say check refundTransactionStatus = Completed for success :contentReference[oaicite:22]{index=22}
        const ok = (refund === null || refund === void 0 ? void 0 : refund.refundTransactionStatus) === "Completed" ||
            (refund === null || refund === void 0 ? void 0 : refund.statusCode) === "0000";
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
        return res.status(ok ? 200 : 400).json({
            success: ok,
            refund,
        });
    })),
};
