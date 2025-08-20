import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { OrderServices } from './order.service';

const getAllOrders = catchAsync(async (req, res) => {
  const result = await OrderServices.getAllOrders(req.query);
  const isok = result ? true : false;
  res.status(isok ? 200 : 400).json({
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok ? 'Orders Fetched Successfully' : 'Orders Fetching Failed',
    Data: isok ? result : [],
  });
});

const getOrderById = catchAsync(async (req, res) => {
  const result = await OrderServices.getOrderById(req.params.id);
  const isok = result ? true : false;
  res.status(isok ? 200 : 400).json({
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok ? 'Order Fetched Successfully' : 'Order Fetching Failed',
    Data: isok ? result : [],
  });
});

const getUserOrders = catchAsync(async (req, res) => {
  const result = await OrderServices.getUserOrders(req.params.id, req.query);
  const isok = result ? true : false;
  res.status(isok ? 200 : 400).json({
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok ? 'Orders Fetched Successfully' : 'Orders Fetching Failed',
    Data: isok ? result : [],
  });
});

const updateOrderStatus = catchAsync(async (req, res) => {
  const result = await OrderServices.updateOrderStatus(req.params.id, req.body);
  const isok = result ? true : false;
  res.status(isok ? 200 : 400).json({
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok
      ? 'Order Status Updated Successfully'
      : 'Order Status Updating Failed',
    Data: isok ? result : [],
  });
});

const getMyOrders = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const result = await OrderServices.getMyOrders(userId, req.query);
  const isok = result ? true : false;

  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok ? 'Orders fatched successfully!' : 'Orders Fatching Failed',
    Data: isok ? result : [],
  });
});

const getMyOrderByID = catchAsync(async (req, res) => {
  const userId = req.user.id;
  console.log('req.params.id', req.params.id);
  const result = await OrderServices.getMyOrder(userId, req.params.id);
  const isok = result ? true : false;
  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok ? 'Order Fetched Successfully' : 'Order Fetching Failed',
    Data: isok ? result : [],
  });
});

const getAllCustomers = catchAsync(async (req, res) => {
  const result = await OrderServices.getAllCustomers(req.query);
  const isok = result ? true : false;
  res.status(isok ? 200 : 400).json({
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok
      ? 'Customers Fetched Successfully'
      : 'Customers Fetching Failed',
    Data: isok ? result : [],
  });
});

export const OrderController = {
  getAllOrders,
  getOrderById,
  getUserOrders,
  updateOrderStatus,
  getMyOrders,
  getMyOrderByID,
  getAllCustomers,
};
