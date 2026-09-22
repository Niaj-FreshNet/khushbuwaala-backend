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
            // Find existing active cart item for this user/guest
            const existingItem = yield client_1.prisma.cartItem.findFirst({
                where: {
                    productId: payload.productId,
                    variantId: (_a = payload.variantId) !== null && _a !== void 0 ? _a : null,
                    userId: (_b = payload.userId) !== null && _b !== void 0 ? _b : null,
                    status: 'IN_CART',
                },
            });
            if (existingItem) {
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
    // Append to CartItemServices inside src/modules/Cart/cart.services.ts
    getAllCarts(queryParams) {
        return __awaiter(this, void 0, void 0, function* () {
            const page = Math.max(1, Number(queryParams.page || 1));
            const limit = Math.max(1, Number(queryParams.limit || 20));
            const skip = (page - 1) * limit;
            const where = {};
            if (queryParams.status) {
                where.status = queryParams.status;
            }
            if (queryParams.userId) {
                where.userId = queryParams.userId;
            }
            if (queryParams.searchTerm) {
                const term = String(queryParams.searchTerm).trim();
                where.OR = [
                    { product: { name: { contains: term, mode: 'insensitive' } } },
                    { user: { name: { contains: term, mode: 'insensitive' } } },
                    { user: { email: { contains: term, mode: 'insensitive' } } },
                    { user: { phone: { contains: term, mode: 'insensitive' } } },
                ];
            }
            const [items, total] = yield Promise.all([
                client_1.prisma.cartItem.findMany({
                    where,
                    skip,
                    take: limit,
                    include: {
                        product: {
                            select: {
                                id: true,
                                name: true,
                                primaryImage: true,
                                slug: true,
                            },
                        },
                        variant: {
                            select: {
                                id: true,
                                sku: true,
                                size: true,
                                unit: true,
                                price: true,
                            },
                        },
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                                phone: true,
                                imageUrl: true,
                            },
                        },
                        order: {
                            select: {
                                id: true,
                                invoice: true,
                                status: true,
                            },
                        },
                    },
                    orderBy: { createdAt: 'desc' },
                }),
                client_1.prisma.cartItem.count({ where }),
            ]);
            return {
                meta: {
                    page,
                    limit,
                    total,
                    totalPage: Math.ceil(total / limit),
                },
                data: items,
            };
        });
    },
};
