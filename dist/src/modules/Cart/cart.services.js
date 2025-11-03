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
exports.CartItemServices = void 0;
const http_status_1 = __importDefault(require("http-status"));
const AppError_1 = __importDefault(require("../../errors/AppError"));
const client_1 = require("../../../prisma/client");
exports.CartItemServices = {
    // ✅ Add a product/variant to cart
    addToCart(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d;
            let price;
            // ✅ Determine price
            if (payload.variantId) {
                const variant = yield client_1.prisma.productVariant.findUnique({
                    where: { id: payload.variantId },
                });
                if (!variant)
                    throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Product variant not found');
                price = variant.price;
            }
            else if (payload.price) {
                price = payload.price;
            }
            else {
                throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Please select a valid variant or provide a price');
            }
            // ✅ Check if the item already exists (same user/guest + product + variant)
            const existingItem = yield client_1.prisma.cartItem.findFirst({
                where: {
                    productId: payload.productId,
                    variantId: (_a = payload.variantId) !== null && _a !== void 0 ? _a : null,
                    userId: (_b = payload.userId) !== null && _b !== void 0 ? _b : null,
                    status: 'IN_CART',
                },
            });
            if (existingItem) {
                // ✅ If exists, just update quantity
                return client_1.prisma.cartItem.update({
                    where: { id: existingItem.id },
                    data: {
                        quantity: existingItem.quantity + payload.quantity,
                        updatedAt: new Date(),
                    },
                    include: {
                        product: true,
                        variant: true,
                    },
                });
            }
            // ✅ Create new cart item (even if userId is null)
            return client_1.prisma.cartItem.create({
                data: {
                    userId: (_c = payload.userId) !== null && _c !== void 0 ? _c : null,
                    productId: payload.productId,
                    variantId: (_d = payload.variantId) !== null && _d !== void 0 ? _d : null,
                    size: payload.size,
                    unit: payload.unit,
                    quantity: payload.quantity,
                    price,
                    status: 'IN_CART',
                },
                include: {
                    product: true,
                    variant: true,
                },
            });
        });
    },
    // ✅ Get user (or guest) cart
    getUserCart(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            return client_1.prisma.cartItem.findMany({
                where: {
                    userId: userId !== null && userId !== void 0 ? userId : null,
                    status: 'IN_CART',
                },
                include: {
                    product: true,
                    variant: true,
                },
                orderBy: {
                    createdAt: 'desc',
                },
            });
        });
    },
    // ✅ Update quantity of cart item
    updateCartItem(id, quantity) {
        return __awaiter(this, void 0, void 0, function* () {
            const item = yield client_1.prisma.cartItem.findUnique({ where: { id } });
            if (!item)
                throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Cart item not found');
            return client_1.prisma.cartItem.update({
                where: { id },
                data: { quantity },
                include: {
                    product: true,
                    variant: true,
                },
            });
        });
    },
    // ✅ Remove a specific cart item
    removeCartItem(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const item = yield client_1.prisma.cartItem.findUnique({ where: { id } });
            if (!item)
                throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Cart item not found');
            return client_1.prisma.cartItem.delete({ where: { id } });
        });
    },
};
