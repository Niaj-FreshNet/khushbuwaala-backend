import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { ReviewServices } from './review.service';

const createReview = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const result = await ReviewServices.createReview(userId, req.body);
  const isok = result ? true : false;
  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok ? 'Review Created Successfully' : 'Review Creation Failed',
    Data: isok ? result : [],
  });
});

const getAllReviews = catchAsync(async (req, res) => {
  const result = await ReviewServices.getAllReviews(req.query);
  const isok = result ? true : false;
  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok ? 'Reviews Fetched Successfully' : 'Reviews Fetching Failed',
    Data: isok ? result : [],
  });
});

const getAllReviewsAdmin = catchAsync(async (req, res) => {
  const result = await ReviewServices.getAllReviewsAdmin(req.query);
  const isok = result ? true : false;
  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok ? 'Reviews Fetched Successfully' : 'Reviews Fetching Failed',
    Data: isok ? result : [],
  });
});

const updateReview = catchAsync(async (req, res) => {
  const result = await ReviewServices.updateReview(req.params.id, req.body);
  const isok = result ? true : false;
  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok ? 'Review Updated Successfully' : 'Review Updation Failed',
    Data: isok ? result : [],
  });
});

export const reviewController = {
  createReview,
  getAllReviews,
  getAllReviewsAdmin,
  updateReview,
};
