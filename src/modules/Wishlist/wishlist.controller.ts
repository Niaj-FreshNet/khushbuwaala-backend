import httpStatus from 'http-status';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { requireUser } from '../../utils/requestUser';
import { WishlistServices } from './wishlist.service';

const getWishlist = catchAsync(async (req, res) => {
  const data = await WishlistServices.getWishlist(requireUser(req).id);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Wishlist retrieved successfully', data });
});

const addToWishlist = catchAsync(async (req, res) => {
  const data = await WishlistServices.addToWishlist(requireUser(req).id, req.body?.productId);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Saved to wishlist', data });
});

const mergeWishlist = catchAsync(async (req, res) => {
  const data = await WishlistServices.mergeWishlist(requireUser(req).id, req.body?.productIds ?? []);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Wishlist updated', data });
});

const removeFromWishlist = catchAsync(async (req, res) => {
  const data = await WishlistServices.removeFromWishlist(requireUser(req).id, req.params.productId);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Removed from wishlist', data });
});

const clearWishlist = catchAsync(async (req, res) => {
  const data = await WishlistServices.clearWishlist(requireUser(req).id);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Wishlist cleared', data });
});

export const WishlistController = { getWishlist, addToWishlist, mergeWishlist, removeFromWishlist, clearWishlist };
