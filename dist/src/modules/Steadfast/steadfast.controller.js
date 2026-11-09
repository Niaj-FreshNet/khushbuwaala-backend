"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.handleWebhook = exports.getBalance = exports.sendOrderToSteadfast = void 0;
const crypto_1 = __importDefault(require("crypto"));
const steadfastService = __importStar(require("./steadfast.service"));
const client_1 = require("../../../prisma/client");
const AppError_1 = __importDefault(require("../../errors/AppError"));
const http_status_1 = __importDefault(require("http-status"));
const sendOrderToSteadfast = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { orderId } = req.params;
        const order = yield client_1.prisma.order.findUnique({
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
            throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Order not found');
        }
        const shippingInfo = order.shipping || {};
        // Build item description string from order items
        const itemDescription = (order.orderItems || [])
            .map((item) => {
            var _a;
            const pName = ((_a = item.product) === null || _a === void 0 ? void 0 : _a.name) || 'Product';
            const size = item.size ? `${item.size} ${item.unit || ''}` : '';
            return `${item.quantity}x ${pName} ${size}`.trim();
        })
            .join(', ');
        // Fragrance default safety notes
        const defaultNote = "- Glass bottles\n- Liquid inside\n- Handle carefully";
        // Combine customer/order additional notes with default note if present
        const orderNote = (_a = order.additionalNotes) === null || _a === void 0 ? void 0 : _a.trim();
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
        const steadfastResponse = yield steadfastService.createSteadfastOrder(payload);
        if (steadfastResponse === null || steadfastResponse === void 0 ? void 0 : steadfastResponse.consignment) {
            yield client_1.prisma.order.update({
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
    }
    catch (error) {
        next(error);
    }
});
exports.sendOrderToSteadfast = sendOrderToSteadfast;
const getBalance = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield steadfastService.getSteadfastBalance();
        res.status(200).json({ success: true, data: result });
    }
    catch (error) {
        next(error);
    }
});
exports.getBalance = getBalance;
const handleWebhook = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const signature = req.headers['x-signature'];
        const secretToken = process.env.STEADFAST_SECRET_TOKEN;
        const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));
        const expectedSignature = crypto_1.default
            .createHmac('sha256', secretToken)
            .update(rawBody)
            .digest('hex');
        if (!signature ||
            signature.length !== expectedSignature.length ||
            !crypto_1.default.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
            return res.status(401).send('Unauthorized webhook signature');
        }
        const event = req.body;
        if (event.notification_type === 'delivery_status') {
            const { invoice, status, delivery_charge } = event;
            yield client_1.prisma.order.updateMany({
                where: { invoice },
                data: Object.assign({ courierStatus: status }, (delivery_charge !== undefined ? { deliveryCharge: Number(delivery_charge) } : {})),
            });
        }
        return res.status(200).json({ status: 'success' });
    }
    catch (error) {
        next(error);
    }
});
exports.handleWebhook = handleWebhook;
