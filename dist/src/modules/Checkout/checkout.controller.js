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
const emails_1 = require("../../helpers/emailSender/emails");
const order_service_1 = require("../Order/order.service");
exports.CheckoutController = {
    // ==========================================
    // DGePay Gateway Methods
    // ==========================================
    // POST /api/checkout/dgepay/create
    createDgepay: (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Invalid request body");
        }
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
        if (!order.payToken || order.payToken !== payToken) {
            throw new AppError_1.default(http_status_1.default.UNAUTHORIZED, "Invalid payment token");
        }
        const callbackBase = process.env.DGEPAY_CALLBACK_BASE_URL;
        if (!callbackBase) {
            throw new AppError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, "DGEPAY_CALLBACK_BASE_URL missing");
        }
        const redirect_url = `${callbackBase}/api/checkout/dgepay/callback`;
        const invoiceSafe = String(order.invoice || (0, checkout_utils_1.makeInvoice)()).replace(/[^0-9a-zA-Z_-]/g, "").slice(0, 50);
        const amount = Number(order.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Invalid order amount");
        }
        const rawPhone = ((_a = order === null || order === void 0 ? void 0 : order.shipping) === null || _a === void 0 ? void 0 : _a.phone) ||
            ((_b = order === null || order === void 0 ? void 0 : order.billing) === null || _b === void 0 ? void 0 : _b.phone) ||
            (order === null || order === void 0 ? void 0 : order.phone) ||
            "01700000000";
        const cleanPhone = rawPhone.replace(/\D/g, "").slice(-11);
        // Numeric transaction ID
        const numericTxnId = `${Date.now()}${Math.floor(10000 + Math.random() * 90000)}`;
        const payment = yield client_1.prisma.payment.create({
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
            const response = yield checkout_service_1.dgepayGateway.initiatePayment({
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
            const paymentUrl = ((_c = response === null || response === void 0 ? void 0 : response.data) === null || _c === void 0 ? void 0 : _c.webview_url) ||
                (response === null || response === void 0 ? void 0 : response.webview_url) ||
                ((_d = response === null || response === void 0 ? void 0 : response.data) === null || _d === void 0 ? void 0 : _d.payment_url) ||
                ((_e = response === null || response === void 0 ? void 0 : response.data) === null || _e === void 0 ? void 0 : _e.redirect_url) ||
                (response === null || response === void 0 ? void 0 : response.payment_url) ||
                (response === null || response === void 0 ? void 0 : response.redirect_url) ||
                (response === null || response === void 0 ? void 0 : response.url);
            if (!paymentUrl) {
                yield client_1.prisma.payment.update({
                    where: { id: payment.id },
                    data: { status: "FAILED", gatewayResponse: response },
                });
                const errorMsg = (Array.isArray(response === null || response === void 0 ? void 0 : response.error) ? response.error.join(", ") : null) ||
                    (response === null || response === void 0 ? void 0 : response.message) ||
                    ((_f = response === null || response === void 0 ? void 0 : response.data) === null || _f === void 0 ? void 0 : _f.message) ||
                    "DGePay payment initialization failed";
                throw new AppError_1.default(http_status_1.default.BAD_REQUEST, errorMsg);
            }
            yield client_1.prisma.payment.update({
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
        }
        catch (err) {
            console.error("❌ DGePay Exception:", ((_g = err === null || err === void 0 ? void 0 : err.response) === null || _g === void 0 ? void 0 : _g.data) || (err === null || err === void 0 ? void 0 : err.message));
            yield client_1.prisma.payment.update({
                where: { id: payment.id },
                data: { status: "FAILED", gatewayResponse: ((_h = err === null || err === void 0 ? void 0 : err.response) === null || _h === void 0 ? void 0 : _h.data) || (err === null || err === void 0 ? void 0 : err.message) },
            });
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, ((_k = (_j = err === null || err === void 0 ? void 0 : err.response) === null || _j === void 0 ? void 0 : _j.data) === null || _k === void 0 ? void 0 : _k.message) || (err === null || err === void 0 ? void 0 : err.message) || "DGePay initialization error");
        }
    })),
    // POST & GET /api/checkout/dgepay/callback
    callbackDgepay: (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        const successUrl = process.env.DGEPAY_SUCCESS_REDIRECT || `${process.env.CLIENT_URL}/thank-you`;
        const failUrl = process.env.DGEPAY_FAIL_REDIRECT || `${process.env.CLIENT_URL}/error`;
        let payload = req.body;
        if (typeof req.body === "string" && req.body.length > 20) {
            try {
                payload = checkout_service_1.dgepayGateway.decryptPayload(req.body);
            }
            catch (e) {
                // Fall back to query or regular body
            }
        }
        const unique_txn_id = (payload === null || payload === void 0 ? void 0 : payload.unique_txn_id) || ((_a = req.query) === null || _a === void 0 ? void 0 : _a.unique_txn_id);
        if (!unique_txn_id) {
            return res.redirect(`${failUrl}?message=missing_txn_id`);
        }
        const payment = yield client_1.prisma.payment.findUnique({
            where: { id: unique_txn_id },
        });
        if (!payment) {
            return res.redirect(`${failUrl}?message=payment_not_found`);
        }
        if (payment.status === "COMPLETED") {
            return res.redirect(`${successUrl}?order=${payment.orderId}`);
        }
        try {
            const statusRes = yield checkout_service_1.dgepayGateway.checkTransactionStatus(unique_txn_id);
            const txnData = (statusRes === null || statusRes === void 0 ? void 0 : statusRes.data) || statusRes;
            const isSuccess = (txnData === null || txnData === void 0 ? void 0 : txnData.transaction_status) === "SUCCESS" ||
                (txnData === null || txnData === void 0 ? void 0 : txnData.status) === "SUCCESS" ||
                (statusRes === null || statusRes === void 0 ? void 0 : statusRes.status) === 200;
            if (isSuccess) {
                let completedOrder = null;
                yield client_1.prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
                    yield tx.payment.update({
                        where: { id: payment.id },
                        data: {
                            status: "COMPLETED",
                            gatewayTrxId: (txnData === null || txnData === void 0 ? void 0 : txnData.bank_txn_id) || (txnData === null || txnData === void 0 ? void 0 : txnData.dgepay_txn_id) || unique_txn_id,
                            gatewayStatus: "COMPLETED",
                            gatewayResponse: txnData,
                        },
                    });
                    completedOrder = yield tx.order.update({
                        where: { id: payment.orderId },
                        data: { isPaid: true, method: "DGEPAY", status: "PROCESSING" },
                        include: {
                            customer: { select: { id: true, name: true, email: true, phone: true } },
                            orderItems: {
                                include: { product: true, variant: true },
                            },
                        },
                    });
                    if (completedOrder.coupon) {
                        yield discount_service_1.DiscountServices.consumeDiscountUsageByCode(tx, completedOrder.coupon, completedOrder.id);
                    }
                }));
                // ✅ Trigger Emails & Server CAPI Purchase upon verified successful payment
                const customerEmail = ((_b = completedOrder === null || completedOrder === void 0 ? void 0 : completedOrder.shipping) === null || _b === void 0 ? void 0 : _b.email) ||
                    ((_c = completedOrder === null || completedOrder === void 0 ? void 0 : completedOrder.billing) === null || _c === void 0 ? void 0 : _c.email) ||
                    ((_d = completedOrder === null || completedOrder === void 0 ? void 0 : completedOrder.customer) === null || _d === void 0 ? void 0 : _d.email) ||
                    (completedOrder === null || completedOrder === void 0 ? void 0 : completedOrder.email);
                const customerPhone = ((_e = completedOrder === null || completedOrder === void 0 ? void 0 : completedOrder.shipping) === null || _e === void 0 ? void 0 : _e.phone) ||
                    ((_f = completedOrder === null || completedOrder === void 0 ? void 0 : completedOrder.billing) === null || _f === void 0 ? void 0 : _f.phone) ||
                    ((_g = completedOrder === null || completedOrder === void 0 ? void 0 : completedOrder.customer) === null || _g === void 0 ? void 0 : _g.phone) ||
                    (completedOrder === null || completedOrder === void 0 ? void 0 : completedOrder.phone);
                if (customerEmail && !customerEmail.includes('@khushbuwaala.local')) {
                    (0, emails_1.sendOrderConfirmationEmail)(customerEmail, completedOrder).catch((e) => console.error("DGePay confirmation email error:", e.message));
                }
                const adminEmail = process.env.ADMIN_EMAIL || "khushbuwaala@gmail.com";
                if (adminEmail) {
                    (0, emails_1.sendOrderNotificationToAdmin)(adminEmail, Object.assign(Object.assign({}, completedOrder), { email: customerEmail || 'N/A', address: ((_h = completedOrder.shipping) === null || _h === void 0 ? void 0 : _h.address) || completedOrder.address, district: ((_j = completedOrder.shipping) === null || _j === void 0 ? void 0 : _j.district) || '', phone: customerPhone || 'N/A', date: new Date().toLocaleDateString('en-GB'), note: completedOrder.additionalNotes, cartItems: (completedOrder.orderItems || []).map((oi) => {
                            var _a, _b, _c;
                            return ({
                                productName: ((_a = oi.product) === null || _a === void 0 ? void 0 : _a.name) || 'Product',
                                productImageUrls: [(_b = oi.product) === null || _b === void 0 ? void 0 : _b.primaryImage],
                                size: ((_c = oi.variant) === null || _c === void 0 ? void 0 : _c.size) ? `${oi.variant.size} ${oi.variant.unit || ''}`.trim() : 'Standard',
                                quantity: oi.quantity,
                                price: Number(oi.price || 0),
                            });
                        }) })).catch((e) => console.error("Admin notification email error:", e.message));
                }
                // ✅ Fire Server-Side Meta CAPI Purchase with the exact same order ID / event_id (`kw_${orderId}`)
                // This matches the browser-side event_id on the Thank You page for flawless deduplication.
                (0, order_service_1.sendMetaCapiPurchase)(completedOrder, customerEmail, customerPhone).catch((err) => console.error("❌ Gateway CAPI Dispatch Error:", err));
                return res.redirect(`${successUrl}?order=${payment.orderId}`);
            }
            yield client_1.prisma.payment.update({
                where: { id: payment.id },
                data: { status: "FAILED", gatewayResponse: txnData },
            });
            return res.redirect(`${failUrl}?message=payment_failed`);
        }
        catch (err) {
            yield client_1.prisma.payment.update({
                where: { id: payment.id },
                data: { status: "FAILED", gatewayResponse: err === null || err === void 0 ? void 0 : err.message },
            });
            return res.redirect(`${failUrl}?message=verification_error`);
        }
    })),
};
