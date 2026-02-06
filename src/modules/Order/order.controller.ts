import httpStatus from 'http-status';
import crypto from "crypto";
import AppError from '../../errors/AppError';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { OrderServices } from './order.service';
import { ORDER_ERROR_MESSAGES } from './order.constant';

// Create Order (Customer OR Guest)
const createOrder = catchAsync(async (req, res) => {
  const payToken = crypto.randomBytes(24).toString("hex");
  const userId = req.user?.id || null; // Optional Auth user
  const { 
    cartItemIds, 
    amount, 
    isPaid, 
    method, 
    saleType, 
    shippingCost, 
    additionalNotes, 
    shippingAddress, 
    billingAddress, 
    orderSource, 
    customerInfo,
    coupon,          
    discountAmount,  
  } = req.body;

  // Validation
  if (!cartItemIds || !Array.isArray(cartItemIds) || cartItemIds.length === 0) {
    throw new AppError(httpStatus.BAD_REQUEST, ORDER_ERROR_MESSAGES.EMPTY_ORDER);
  }
  if (!amount || amount <= 0) {
    throw new AppError(httpStatus.BAD_REQUEST, ORDER_ERROR_MESSAGES.TOTAL_AMOUNT_INVALID);
  }

  // ✅ Build payload
  const payload = {
    customerId: userId, // can be null for guests
    payToken, // ✅ add
    amount,
    isPaid: isPaid || false,
    method,
    orderSource: orderSource || 'WEBSITE',
    cartItemIds,
    customerInfo: customerInfo || null, // for guest user data (name, phone, etc.)
    saleType,
    shippingCost,
    additionalNotes,
    shippingAddress,
    billingAddress,
    coupon: coupon || null,                       
    discountAmount: Number(discountAmount || 0),
  };

  // ✅ Create order through service
  const result = await OrderServices.createOrderWithCartItems(payload);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Order created successfully',
    data: result,
  });
});

// Get All Orders (Admin)
const getAllOrders = catchAsync(async (req, res) => {
  const result = await OrderServices.getAllOrders(req.query);

  sendResponse(res, {
    statusCode: result ? 200 : 400,
    success: !!result,
    message: result ? 'Orders fetched successfully' : 'Orders fetching failed',
    data: result || [],
  });
});

// Get Order By ID (Admin)
const getOrderById = catchAsync(async (req, res) => {
  const result = await OrderServices.getOrderById(req.params.id);

  if (!result) throw new AppError(httpStatus.NOT_FOUND, ORDER_ERROR_MESSAGES.NOT_FOUND);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Order fetched successfully',
    data: result,
  });
});

// Get User Orders (Admin view)
const getUserOrders = catchAsync(async (req, res) => {
  const result = await OrderServices.getUserOrders(req.params.id, req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Orders fetched successfully',
    data: result,
  });
});

// Update Order Status (Admin)
const updateOrderStatus = catchAsync(async (req, res) => {
  const result = await OrderServices.updateOrderStatus(req.params.id, req.body);

  if (!result) throw new AppError(httpStatus.BAD_REQUEST, ORDER_ERROR_MESSAGES.STATUS_UPDATE_FAILED);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Order status updated successfully',
    data: result,
  });
});

// Get Logged-in User Orders
const getMyOrders = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const result = await OrderServices.getMyOrders(userId, req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Orders fetched successfully',
    data: result,
  });
});

// Get Logged-in User Single Order
const getMyOrderByID = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const result = await OrderServices.getMyOrder(userId, req.params.id);

  if (!result) throw new AppError(httpStatus.NOT_FOUND, ORDER_ERROR_MESSAGES.NOT_FOUND);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Order fetched successfully',
    data: result,
  });
});

// Get All Customers (Admin)
const getAllCustomers = catchAsync(async (req, res) => {
  const result = await OrderServices.getAllCustomers(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Customers fetched successfully',
    data: result,
  });
});

export const OrderController = {
  createOrder,
  getAllOrders,
  getOrderById,
  getUserOrders,
  updateOrderStatus,
  getMyOrders,
  getMyOrderByID,
  getAllCustomers,
};
