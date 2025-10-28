import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { SaleServices } from './sales.service';

// Create a manual sale
const createSale = catchAsync(async (req: Request, res: Response) => {
  const payload = req.body;
  const userId = req.user.id; // SALESMAN or ADMIN creating the sale
  const result = await SaleServices.createSale(payload, userId);

  sendResponse(res, {
    statusCode: result ? 200 : 400,
    success: !!result,
    message: result ? 'Sale added successfully' : 'Sale creation failed',
    data: result ?? null,
  });
});

// Get all sales (admin)
const getAllSales = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await SaleServices.getAllSales(req.query);
  sendResponse(res, {
    statusCode: result ? 200 : 400,
    success: !!result,
    message: result ? 'Sales fetched successfully' : 'Failed to fetch sales',
    data: result ?? [],
  });
});

// Get sales for current salesman
const getMySales = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await SaleServices.getMySales(userId, req.query);

  sendResponse(res, {
    statusCode: result ? 200 : 400,
    success: !!result,
    message: result ? 'Sales fetched successfully' : 'Failed to fetch sales',
    data: result ?? [],
  });
});

// Get Order By ID (Admin)
const getSaleById = catchAsync(async (req, res) => {
  const result = await SaleServices.getSaleById(req.params.id);

  sendResponse(res, {
    statusCode: result ? 200 : 400,
    success: true,
    message: 'Sale fetched successfully',
    data: result,
  });
});

// Get sales by customer phone or name
const getSalesByCustomer = catchAsync(async (req: Request, res: Response) => {
  const { phone } = req.params;
  const result = await SaleServices.getSalesByCustomer(phone, req.query);

  sendResponse(res, {
    statusCode: result ? 200 : 400,
    success: !!result,
    message: result ? 'Customer sales fetched successfully' : 'No sales found for this customer',
    data: result ?? [],
  });
});

// Update sale status
const updateSaleStatus = catchAsync(async (req: Request, res: Response) => {
  const saleId = req.params.id;
  const payload = req.body; // e.g., { status: "DELIVERED" }
  const result = await SaleServices.updateSaleStatus(saleId, payload);

  sendResponse(res, {
    statusCode: result ? 200 : 400,
    success: !!result,
    message: result ? 'Sale status updated successfully' : 'Failed to update sale status',
    data: result ?? null,
  });
});

// Sales analytics for admin
const getSalesAnalytics = catchAsync(async (req: Request, res: Response) => {
  const result = await SaleServices.getSalesAnalytics(req.query);

  sendResponse(res, {
    statusCode: result ? 200 : 400,
    success: !!result,
    message: result ? 'Sales analytics fetched successfully' : 'Failed to fetch analytics',
    data: result ?? {},
  });
});

export const SalesController = {
  createSale,
  getAllSales,
  getMySales,
  getSaleById,
  getSalesByCustomer,
  updateSaleStatus,
  getSalesAnalytics,
};
