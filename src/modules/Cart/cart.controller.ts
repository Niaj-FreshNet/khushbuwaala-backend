// controllers/cartItem.controller.ts
import { Request, Response } from 'express';
import httpStatus from 'http-status';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { CartItemServices } from './cart.services';

export const CartItemController = {
  addToCart: catchAsync(async (req, res) => {
    const userId = req.user?.id; // from auth middleware
    const { productId, variantId, quantity, price } = req.body;

    const item = await CartItemServices.addToCart({ userId, productId, variantId, quantity });

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: 'Item added to cart',
      data: item,
    });
  }),

  getUserCart: catchAsync(async (req, res) => {
    const userId = req.user?.id;
    const items = await CartItemServices.getUserCart(userId);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Cart fetched successfully',
      data: items,
    });
  }),

  updateCartItem: catchAsync(async (req, res) => {
    const { id } = req.params;
    const { quantity } = req.body;

    const item = await CartItemServices.updateCartItem(id, quantity);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Cart item updated',
      data: item,
    });
  }),

  removeCartItem: catchAsync(async (req, res) => {
    const { id } = req.params;
    await CartItemServices.removeCartItem(id);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Cart item removed',
    });
  }),
};
