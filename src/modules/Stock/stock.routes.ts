import { Router } from 'express';
import { StockController } from './stock.controller';
import auth from '../../middlewares/auth';

const router = Router();

// Get all products with stock
router.get(
  '/get-all-products',
  auth('SALESMAN', 'ADMIN', 'SUPER_ADMIN'),
  StockController.getAllProducts
);

// Get low stock products
router.get(
  '/get-low-stock-products',
  auth('SALESMAN', 'ADMIN', 'SUPER_ADMIN'),
  StockController.getLowStockProducts
);

// Add stock
router.post(
  '/add-stock',
  auth('SALESMAN', 'ADMIN', 'SUPER_ADMIN'),
  StockController.addStock
);

// Get stock logs for a product
router.get(
  '/get-stock-logs/:productId',
  auth('SALESMAN', 'ADMIN', 'SUPER_ADMIN'),
  StockController.getStockLogs
);

export const StockRoutes = router;