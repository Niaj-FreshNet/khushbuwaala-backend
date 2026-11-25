import { Router } from 'express';
import { reviewController } from './review.controller';
import auth from '../../middlewares/auth';
import AppError from '../../errors/AppError';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { requireUser } from '../../utils/requestUser';
import { ReviewServices } from './review.service';

const router = Router();

// ── Reviews on the home page ──────────────────────────────────────────────────────────────
// Public: what the storefront draws.
router.get(
  '/home',
  catchAsync(async (_req, res) => {
    const data = await ReviewServices.getHomeReviews();
    res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
    sendResponse(res, { statusCode: 200, success: true, message: 'Home page reviews', data });
  })
);

// Admin: section on/off, pinned and hidden reviews, and what is showing now.
router.get(
  '/home/admin',
  auth('ADMIN', 'SUPER_ADMIN'),
  catchAsync(async (_req, res) => {
    const data = await ReviewServices.getHomeReviewsAdmin();
    sendResponse(res, { statusCode: 200, success: true, message: 'Home page review settings', data });
  })
);

router.patch(
  '/home/section',
  auth('ADMIN', 'SUPER_ADMIN'),
  catchAsync(async (req, res) => {
    if (typeof req.body?.enabled !== 'boolean') throw new AppError(400, 'Send "enabled" as true or false.');
    const data = await ReviewServices.setHomeSectionEnabled(req.body.enabled, requireUser(req).id);
    sendResponse(res, { statusCode: 200, success: true, message: 'Home page reviews updated', data });
  })
);

router.patch(
  '/home/choice/:id',
  auth('ADMIN', 'SUPER_ADMIN'),
  catchAsync(async (req, res) => {
    const choice = req.body?.choice;
    if (choice !== 'auto' && choice !== 'pinned' && choice !== 'hidden') {
      throw new AppError(400, 'Choose "auto", "pinned" or "hidden".');
    }
    const data = await ReviewServices.setHomeChoice(req.params.id, choice, requireUser(req).id);
    sendResponse(res, { statusCode: 200, success: true, message: 'Home page reviews updated', data });
  })
);

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
