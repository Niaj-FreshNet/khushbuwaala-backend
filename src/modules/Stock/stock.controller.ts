import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { StockServices } from './stock.service';

const getAllProducts = catchAsync(async (req: Request, res: Response) => {
  const result = await StockServices.getAllProducts(req.query);
  sendResponse(res, {
    statusCode: result ? 200 : 400,
    success: !!result,
    message: result ? 'Products fetched successfully' : 'Failed to fetch products',
    data: result ?? [],
  });
});

const getLowStockProducts = catchAsync(async (req: Request, res: Response) => {
  const result = await StockServices.getLowStockProducts(req.query);
  sendResponse(res, {
    statusCode: result ? 200 : 400,
    success: !!result,
    message: result ? 'Low stock products fetched successfully' : 'Failed to fetch low stock products',
    data: result ?? [],
  });
});

const addStock = catchAsync(async (req: Request, res: Response) => {
  const payload = req.body;
  const result = await StockServices.addStock(payload);
  sendResponse(res, {
    statusCode: result ? 200 : 400,
    success: !!result,
    message: result ? 'Stock added successfully' : 'Failed to add stock',
    data: result ?? null,
  });
});

const getStockLogs = catchAsync(async (req: Request, res: Response) => {
  const { productId } = req.params;
  const result = await StockServices.getStockLogs(productId);
  sendResponse(res, {
    statusCode: result ? 200 : 400,
    success: !!result,
    message: result ? 'Stock logs fetched successfully' : 'Failed to fetch stock logs',
    data: result ?? [],
  });
});

export const StockController = {
  getAllProducts,
  getLowStockProducts,
  addStock,
  getStockLogs,
};