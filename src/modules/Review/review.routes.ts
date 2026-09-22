import { Router } from 'express';
import { reviewController } from './review.controller';
import auth from '../../middlewares/auth';

const router = Router();

// ✏️ Create a review
router.post('/create-review', auth('OPTIONAL'), reviewController.createReview);

// 🌍 Publicly visible reviews (published only)
router.get('/get-all-reviews', reviewController.getAllReviews);

// 🧠 Admin panel — all reviews, published/unpublished
router.get(
  '/get-all-reviews/admin',
  auth('ADMIN', 'SUPER_ADMIN'),
  reviewController.getAllReviewsAdmin
);

// ✅ Publish / Unpublish Review (Admin only)
router.patch(
  "/publish-review/:id",
  auth("ADMIN", "SUPER_ADMIN"), // Adjust roles as needed
  reviewController.publishReview
);

// ✏️ Update review (admin can publish/unpublish, edit)
router.patch(
  '/update-review/:id',
  auth('ADMIN', 'SUPER_ADMIN'),
  reviewController.updateReview
);

// 👁️ Get single review by ID (public)
router.get('/get-review/:id', reviewController.getReviewById);

// 🧍 Get all reviews by a specific user
router.get('/get-user-reviews/:userId', reviewController.getUserReviews);

// 📦 Get all reviews for a specific product
router.get('/get-product-reviews/:productId', reviewController.getProductReviews);

// 🗑️ Delete review (Admin only)
router.delete(
  '/delete-review/:id',
  auth('ADMIN', 'SUPER_ADMIN'),
  reviewController.deleteReview
);

export const ReviewRoutes = router;
