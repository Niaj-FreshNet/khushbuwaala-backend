import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { ReviewServices } from './review.service';

const createReview = catchAsync(async (req, res) => {
  const userId = req.user?.id ?? null;
  const result = await ReviewServices.createReview(userId, req.body);

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Review created successfully',
    data: result,
  });
});

const getAllReviews = catchAsync(async (req, res) => {
  const result = await ReviewServices.getAllReviews(req.query);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Reviews fetched successfully',
    data: result,
  });
});

const getAllReviewsAdmin = catchAsync(async (req, res) => {
  const result = await ReviewServices.getAllReviewsAdmin(req.query);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'All reviews fetched successfully (admin)',
    data: result,
  });
});

const getReviewById = catchAsync(async (req, res) => {
  const result = await ReviewServices.getReviewById(req.params.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Review fetched successfully',
    data: result,
  });
});

const getUserReviews = catchAsync(async (req, res) => {
  const result = await ReviewServices.getUserReviews(req.params.userId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'User reviews fetched successfully',
    data: result,
  });
});

const getProductReviews = catchAsync(async (req, res) => {
  const result = await ReviewServices.getProductReviews(req.params.productId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Product reviews fetched successfully',
    data: result,
  });
});

const updateReview = catchAsync(async (req, res) => {
  const result = await ReviewServices.updateReview(req.params.id, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Review updated successfully',
    data: result,
  });
});

const publishReview = catchAsync(async (req, res) => {
  const { id } = req.params;
  const result = await ReviewServices.publishReview(id);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: `Review has been ${result.isPublished ? "published" : "unpublished"} successfully.`,
    data: result,
  });
});

export const reviewController = {
  createReview,
  getAllReviews,
  getAllReviewsAdmin,
  getReviewById,
  getUserReviews,
  getProductReviews,
  updateReview,
  publishReview,
};
