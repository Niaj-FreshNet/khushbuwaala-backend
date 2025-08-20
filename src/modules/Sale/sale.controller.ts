import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { SaleServices } from './sale.service';

const addSale = catchAsync(async (req, res) => {
  const payload = req.body;
  const user = req.user;
  const result = await SaleServices.addSale(payload, user.id);
  const isOk = !!result;
  res.status(isOk ? 200 : 400).json({
    statusCode: isOk ? 200 : 400,
    success: isOk,
    message: isOk ? 'Sale Added Successfully' : 'Sale Creation Failed',
    data: isOk ? result : null,
  });
});

const getAllSales = catchAsync(async (req, res) => {
  const result = await SaleServices.getAllSales(req.query);
  const isok = result ? true : false;
  res.status(isok ? 200 : 400).json({
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok ? 'Sales Fetched Successfully' : 'Sales Fetching Failed',
    Data: isok ? result : [],
  });
});

const getSaleById = catchAsync(async (req, res) => {
  const result = await SaleServices.getSaleById(req.params.id);
  const isok = result ? true : false;
  res.status(isok ? 200 : 400).json({
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok ? 'Sale Fetched Successfully' : 'Sale Fetching Failed',
    Data: isok ? result : [],
  });
});

const getUserSales = catchAsync(async (req, res) => {
  const result = await SaleServices.getUserSales(req.params.id, req.query);
  const isok = result ? true : false;
  res.status(isok ? 200 : 400).json({
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok ? 'Sales Fetched Successfully' : 'Sales Fetching Failed',
    Data: isok ? result : [],
  });
});

const updateSaleStatus = catchAsync(async (req, res) => {
  const result = await SaleServices.updateSaleStatus(req.params.id, req.body);
  const isok = result ? true : false;
  res.status(isok ? 200 : 400).json({
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok
      ? 'Sale Status Updated Successfully'
      : 'Sale Status Updating Failed',
    Data: isok ? result : [],
  });
});

const getMySales = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const result = await SaleServices.getMySales(userId, req.query);
  const isok = result ? true : false;

  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok ? 'Sales fatched successfully!' : 'Sales Fatching Failed',
    Data: isok ? result : [],
  });
});

const getMySaleByID = catchAsync(async (req, res) => {
  const userId = req.user.id;
  console.log('req.params.id', req.params.id);
  const result = await SaleServices.getMySaleById(userId, req.params.id);
  const isok = result ? true : false;
  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok ? 'Sale Fetched Successfully' : 'Sale Fetching Failed',
    Data: isok ? result : [],
  });
});

const getAllSalesman = catchAsync(async (req, res) => {
  const result = await SaleServices.getAllSalesman(req.query);
  const isok = result ? true : false;
  res.status(isok ? 200 : 400).json({
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok
      ? 'Salesmans Fetched Successfully'
      : 'Salesmans Fetching Failed',
    Data: isok ? result : [],
  });
});

export const SaleController = {
  addSale,
  getAllSales,
  getSaleById,
  getUserSales,
  updateSaleStatus,
  getMySales,
  getMySaleByID,
  getAllSalesman,
};
