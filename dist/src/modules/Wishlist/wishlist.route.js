"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WishlistRoutes = void 0;
const express_1 = require("express");
const auth_1 = __importDefault(require("../../middlewares/auth"));
const wishlist_controller_1 = require("./wishlist.controller");
const router = (0, express_1.Router)();
router.get('/get-wishlist', (0, auth_1.default)('USER'), wishlist_controller_1.WishlistController.getWishlist);
router.post('/add-to-wishlist', (0, auth_1.default)('USER'), wishlist_controller_1.WishlistController.addToWishlist);
router.delete('/remove-from-wishlist/:id', (0, auth_1.default)('USER'), wishlist_controller_1.WishlistController.removeFromWishlist);
exports.WishlistRoutes = router;
