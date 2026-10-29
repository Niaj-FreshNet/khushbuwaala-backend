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
exports.DiscountServices = void 0;
// src/modules/Discount/discount.service.ts
const http_status_1 = __importDefault(require("http-status"));
const AppError_1 = __importDefault(require("../../errors/AppError"));
const client_1 = require("../../../prisma/client");
exports.DiscountServices = {
    // ── CREATE DISCOUNT ─────────────────────────────
    createDiscount(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const { scope, productId, variantId } = payload;
            const normalizedCode = (_a = payload.code) === null || _a === void 0 ? void 0 : _a.trim();
            const code = normalizedCode ? normalizedCode.toUpperCase() : null;
            if (scope === "ORDER") {
                if (!normalizedCode) {
                    throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Coupon code is required for order discount");
                }
                if (productId || variantId) {
                    throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Order discount cannot be tied to product/variant");
                }
            }
            if (scope === "PRODUCT") {
                if (!productId)
                    throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Product is required for product discount");
                if (variantId)
                    throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Product scope discount cannot have variantId");
            }
            if (scope === "VARIANT") {
                if (!productId)
                    throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Product is required for variant discount");
                if (!variantId)
                    throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Variant is required for variant discount");
            }
            if (productId) {
                const product = yield client_1.prisma.product.findUnique({ where: { id: productId } });
                if (!product)
                    throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Product not found");
            }
            if (variantId) {
                const variant = yield client_1.prisma.productVariant.findUnique({ where: { id: variantId } });
                if (!variant)
                    throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Variant not found");
            }
            if (code) {
                const exists = yield client_1.prisma.discount.findUnique({ where: { code } });
                if (exists)
                    throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Discount code already exists");
            }
            const numericValue = Number(payload.value);
            const numericMaxUsage = payload.maxUsage === undefined || payload.maxUsage === null
                ? undefined
                : Number(payload.maxUsage);
            if (!Number.isFinite(numericValue) || numericValue <= 0) {
                throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Discount value must be a positive number");
            }
            if (numericMaxUsage !== undefined && (!Number.isInteger(numericMaxUsage) || numericMaxUsage < 1)) {
                throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "maxUsage must be a positive integer");
            }
            return client_1.prisma.discount.create({
                data: {
                    scope,
                    productId: scope === "ORDER" ? undefined : productId,
                    variantId: scope === "ORDER" ? undefined : variantId,
                    code: code,
                    type: payload.type,
                    value: numericValue,
                    maxUsage: numericMaxUsage,
                    startDate: payload.startDate ? new Date(payload.startDate) : undefined,
                    endDate: payload.endDate ? new Date(payload.endDate) : undefined,
                },
            });
        });
    },
    // ── GET ALL FOR ADMIN ───────────────────────────
    getAllAdmin() {
        return __awaiter(this, void 0, void 0, function* () {
            return client_1.prisma.discount.findMany({
                include: {
                    product: { select: { name: true } },
                    variant: { select: { sku: true, size: true, unit: true } },
                },
                orderBy: { createdAt: "desc" },
            });
        });
    },
    getSingle(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const discount = yield client_1.prisma.discount.findUnique({
                where: { id },
                include: {
                    product: { select: { name: true } },
                    variant: { select: { sku: true, size: true, unit: true } },
                },
            });
            if (!discount)
                throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Discount not found");
            return discount;
        });
    },
    // ── UPDATE DISCOUNT ────────────────────────────
    updateDiscount(id, payload) {
        return __awaiter(this, void 0, void 0, function* () {
            const discount = yield client_1.prisma.discount.findUnique({ where: { id } });
            if (!discount)
                throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Discount not found");
            const numericValue = payload.value === undefined || payload.value === null
                ? undefined
                : Number(payload.value);
            const numericMaxUsage = payload.maxUsage === undefined || payload.maxUsage === null || payload.maxUsage === ""
                ? undefined
                : Number(payload.maxUsage);
            if (numericValue !== undefined && (!Number.isFinite(numericValue) || numericValue <= 0)) {
                throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Discount value must be a positive number");
            }
            if (numericMaxUsage !== undefined && (!Number.isInteger(numericMaxUsage) || numericMaxUsage < 1)) {
                throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "maxUsage must be a positive integer");
            }
            const toDateOrUndefined = (v) => {
                if (v === undefined)
                    return undefined; // not provided -> don't update
                if (!v || !String(v).trim())
                    return null; // blank -> clear date (set null)
                const d = new Date(v); // accepts "YYYY-MM-DDTHH:mm"
                if (isNaN(d.getTime()))
                    throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Invalid date format");
                return d;
            };
            return client_1.prisma.discount.update({
                where: { id },
                data: Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, (payload.scope !== undefined && { scope: payload.scope })), (payload.productId !== undefined && { productId: payload.productId || null })), (payload.variantId !== undefined && { variantId: payload.variantId || null })), (payload.code !== undefined && { code: payload.code || null })), (payload.type !== undefined && { type: payload.type })), (numericValue !== undefined && { value: numericValue })), (payload.maxUsage !== undefined && { maxUsage: numericMaxUsage !== null && numericMaxUsage !== void 0 ? numericMaxUsage : null })), (payload.startDate !== undefined && { startDate: toDateOrUndefined(payload.startDate) })), (payload.endDate !== undefined && { endDate: toDateOrUndefined(payload.endDate) })),
            });
        });
    },
    // ── DELETE DISCOUNT ────────────────────────────
    deleteDiscount(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const discount = yield client_1.prisma.discount.findUnique({ where: { id } });
            if (!discount)
                throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Discount not found");
            yield client_1.prisma.discount.delete({ where: { id } });
        });
    },
    // ── APPLY DISCOUNT AT CHECKOUT ─────────────────
    applyDiscount(code, items) {
        return __awaiter(this, void 0, void 0, function* () {
            const now = new Date();
            const normalizedCode = code === null || code === void 0 ? void 0 : code.trim().toUpperCase();
            const allDiscounts = yield client_1.prisma.discount.findMany({
                where: {
                    AND: [
                        {
                            OR: [
                                ...(normalizedCode
                                    ? [{ code: { equals: normalizedCode } }]
                                    : []),
                                { code: null },
                            ],
                        },
                        {
                            OR: [
                                { startDate: null },
                                { startDate: { lte: now } },
                            ],
                        },
                        {
                            OR: [
                                { endDate: null },
                                { endDate: { gte: now } },
                            ],
                        },
                    ],
                },
            });
            // If user provided a code, ensure it exists + not overused (BUT DO NOT increment here)
            let codedDiscount = null;
            if (normalizedCode) {
                codedDiscount = yield client_1.prisma.discount.findUnique({
                    where: { code: normalizedCode },
                });
                if (!codedDiscount) {
                    throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Invalid discount code");
                }
                // date validity (extra safety)
                const startOk = !codedDiscount.startDate || codedDiscount.startDate <= now;
                const endOk = !codedDiscount.endDate || codedDiscount.endDate >= now;
                if (!startOk || !endOk) {
                    throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "This coupon is not active right now");
                }
                // usage check (validate only)
                if (codedDiscount.maxUsage && codedDiscount.usedCount >= codedDiscount.maxUsage) {
                    throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "This coupon has reached maximum usage");
                }
            }
            // 1) Item-level discounts (AUTO + promo that targets product/variant)
            const results = items.map(item => {
                const originalPrice = item.price;
                let discountedPrice = originalPrice;
                const autoDiscount = allDiscounts.find(d => !d.code &&
                    (d.scope === "PRODUCT" || d.scope === "VARIANT") &&
                    (d.scope === "VARIANT"
                        ? d.variantId === item.variantId
                        : d.productId === item.productId));
                const promoItemDiscount = allDiscounts.find(d => normalizedCode &&
                    (d.code || "").toUpperCase() === normalizedCode &&
                    (d.scope === "PRODUCT" || d.scope === "VARIANT") &&
                    (d.scope === "VARIANT"
                        ? d.variantId === item.variantId
                        : d.productId === item.productId));
                const apply = (d) => {
                    if (!d)
                        return;
                    if (d.type === "percentage")
                        discountedPrice = discountedPrice * (1 - d.value / 100);
                    else
                        discountedPrice = Math.max(0, discountedPrice - d.value);
                };
                apply(autoDiscount);
                apply(promoItemDiscount);
                // keep no decimals (your preference)
                discountedPrice = Math.round(discountedPrice);
                return Object.assign(Object.assign({}, item), { originalPrice,
                    discountedPrice, appliedDiscounts: [autoDiscount, promoItemDiscount].filter(Boolean) });
            });
            const subtotalOriginal = results.reduce((sum, i) => sum + i.originalPrice * i.qty, 0);
            const subtotalAfterItemDiscount = results.reduce((sum, i) => sum + i.discountedPrice * i.qty, 0);
            // 2) ORDER-level coupon discount (applies once)
            const orderDiscount = allDiscounts.find(d => normalizedCode &&
                (d.code || "").toUpperCase() === normalizedCode &&
                d.scope === "ORDER");
            let orderDiscountAmount = 0;
            if (orderDiscount) {
                if (orderDiscount.type === "percentage") {
                    orderDiscountAmount = Math.round(subtotalAfterItemDiscount * (orderDiscount.value / 100));
                }
                else {
                    orderDiscountAmount = Math.round(orderDiscount.value);
                }
                orderDiscountAmount = Math.min(orderDiscountAmount, subtotalAfterItemDiscount);
            }
            const grandTotalAfterDiscount = Math.max(0, subtotalAfterItemDiscount - orderDiscountAmount);
            const itemDiscountAmount = subtotalOriginal - subtotalAfterItemDiscount;
            const totalDiscountAmount = itemDiscountAmount + orderDiscountAmount;
            return {
                items: results,
                subtotalOriginal,
                subtotalAfterItemDiscount,
                orderDiscount: orderDiscount || null,
                orderDiscountAmount,
                discountAmount: totalDiscountAmount,
                grandTotalAfterDiscount,
            };
        });
    },
    // ── GET AUTO DISCOUNT FOR PRODUCT LISTINGS ─────
    getAutoDiscount(productId, variantId) {
        return __awaiter(this, void 0, void 0, function* () {
            const product = yield client_1.prisma.product.findUnique({
                where: { id: productId },
                include: { variants: true, discounts: true },
            });
            if (!product)
                throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Product not found");
            const now = new Date();
            const activeDiscounts = product.discounts.filter(d => {
                const started = !d.startDate || d.startDate <= now;
                const notEnded = !d.endDate || d.endDate >= now;
                return started && notEnded && (!d.code || String(d.code).trim() === "");
            });
            if (activeDiscounts.length === 0)
                return { discountedPrice: null };
            let originalPrice = 0;
            let discountToApply = null;
            if (variantId) {
                const variant = product.variants.find(v => v.id === variantId);
                if (!variant)
                    throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Variant not found");
                originalPrice = variant.price;
                discountToApply =
                    activeDiscounts.find(d => d.variantId === variantId) ||
                        activeDiscounts.find(d => !d.variantId);
            }
            else {
                const prices = product.variants.map(v => v.price);
                originalPrice = Math.min(...prices);
                discountToApply = activeDiscounts.find(d => !d.variantId);
            }
            if (!discountToApply)
                return { discountedPrice: null };
            let discountedPrice = originalPrice;
            if (discountToApply.type === "percentage")
                discountedPrice = originalPrice * (1 - discountToApply.value / 100);
            else
                discountedPrice = Math.max(0, originalPrice - discountToApply.value);
            return {
                originalPrice,
                discountedPrice,
                discount: discountToApply,
                priceRange: !variantId
                    ? { min: Math.min(...product.variants.map(v => v.price)), max: Math.max(...product.variants.map(v => v.price)) }
                    : undefined,
            };
        });
    },
    consumeDiscountUsageByCode(tx, code, orderId) {
        return __awaiter(this, void 0, void 0, function* () {
            const normalizedCode = code.trim().toUpperCase();
            const discount = yield tx.discount.findUnique({
                where: { code: normalizedCode },
            });
            if (!discount)
                return; // silently ignore (or throw if you prefer strict)
            // Prevent double-consume for same order
            const already = yield tx.orderDiscount.findFirst({
                where: { orderId, discountId: discount.id },
            });
            if (already)
                return;
            // Check active dates again (server truth)
            const now = new Date();
            const startOk = !discount.startDate || discount.startDate <= now;
            const endOk = !discount.endDate || discount.endDate >= now;
            if (!startOk || !endOk) {
                throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Coupon is not active now");
            }
            // Atomic “maxUsage” enforcement (race-safe)
            if (discount.maxUsage) {
                const updated = yield tx.discount.updateMany({
                    where: {
                        id: discount.id,
                        usedCount: { lt: discount.maxUsage },
                    },
                    data: { usedCount: { increment: 1 } },
                });
                if (updated.count === 0) {
                    throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "This coupon has reached maximum usage");
                }
            }
            else {
                yield tx.discount.update({
                    where: { id: discount.id },
                    data: { usedCount: { increment: 1 } },
                });
            }
            // Keep audit link
            yield tx.orderDiscount.create({
                data: {
                    orderId,
                    discountId: discount.id,
                },
            });
        });
    }
};
