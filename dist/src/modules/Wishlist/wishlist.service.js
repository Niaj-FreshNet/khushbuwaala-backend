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
exports.WishlistServices = void 0;
const AppError_1 = __importDefault(require("../../errors/AppError"));
const client_1 = require("../../../prisma/client");
const addToWishlist = (req) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
    const variantId = (_b = req.body) === null || _b === void 0 ? void 0 : _b.variantId;
    if (!userId || !variantId) {
        throw new AppError_1.default(403, 'User ID and Variant ID are required');
    }
    // Check if variant exists
    const variant = yield client_1.prisma.productVariant.findUnique({
        where: { id: variantId },
    });
    if (!variant) {
        throw new AppError_1.default(404, 'Product variant not found');
    }
    // Check if already in wishlist
    const existing = yield client_1.prisma.wishlist.findFirst({
        where: {
            userId,
            variantId,
        },
    });
    if (existing) {
        return {
            success: false,
            message: 'Product variant already in wishlist',
        };
    }
    // Create wishlist entry
    const newWishlistItem = yield client_1.prisma.wishlist.create({
        data: {
            userId,
            variantId,
        },
        include: {
            variant: {
                include: {
                    product: true,
                },
            },
        },
    });
    return {
        success: true,
        message: 'Product variant added to wishlist',
        data: newWishlistItem,
    };
});
const getWishlist = (req) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
    if (!userId) {
        throw new AppError_1.default(403, 'User not authenticated');
    }
    const wishlist = yield client_1.prisma.wishlist.findMany({
        where: {
            userId,
        },
        include: {
            variant: {
                include: {
                    product: {
                        include: {
                            category: true,
                            material: true,
                            variants: true,
                        },
                    },
                },
            },
        },
    });
    return {
        success: true,
        data: wishlist,
    };
});
const removeFromWishlist = (req) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
    console.log(userId);
    const wishlistId = req.params.id;
    if (!userId || !wishlistId) {
        throw new AppError_1.default(403, 'Wishlist ID and User ID are required');
    }
    // Check if already in wishlist
    const existing = yield client_1.prisma.wishlist.findFirst({
        where: {
            id: wishlistId,
        },
    });
    if (!existing) {
        throw new AppError_1.default(404, 'Wishlist item not found');
    }
    if (userId !== existing.userId) {
        throw new AppError_1.default(403, 'Unauthorized');
    }
    const deleted = yield client_1.prisma.wishlist.delete({
        where: {
            id: existing.id,
        },
    });
    return deleted;
});
exports.WishlistServices = {
    addToWishlist,
    getWishlist,
    removeFromWishlist,
};
