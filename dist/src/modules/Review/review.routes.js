"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReviewRoutes = void 0;
const express_1 = require("express");
const review_controller_1 = require("./review.controller");
const auth_1 = __importDefault(require("../../middlewares/auth"));
const router = (0, express_1.Router)();
router.post('/create-review', (0, auth_1.default)('USER'), review_controller_1.reviewController.createReview);
router.get('/get-all-reviews', review_controller_1.reviewController.getAllReviews);
router.get('/get-all-reviews/admin', (0, auth_1.default)('ADMIN'), review_controller_1.reviewController.getAllReviewsAdmin);
router.patch('/update-review/:id', (0, auth_1.default)('ADMIN'), review_controller_1.reviewController.updateReview);
router.get('/get-review/:id', () => { });
router.get('/get-user-reviews/:id', () => { });
router.get('/get-product-reviews/:id', () => { });
exports.ReviewRoutes = router;
