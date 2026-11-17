import { Router } from 'express';
import { SalesController } from './sales.controller';
import auth from '../../middlewares/auth';

const router = Router();

// 1. Static / Specific Routes First
router.post(
  '/create-sale',
  auth('SALESMAN', 'ADMIN', 'SUPER_ADMIN'),
  SalesController.createSale
);

router.get(
  '/get-all-sales',
  auth('ADMIN', 'SUPER_ADMIN'),
  SalesController.getAllSales
);

router.get(
  '/my-sales',
  auth('SALESMAN', 'ADMIN', 'SUPER_ADMIN'),
  SalesController.getMySales
);

router.get(
  '/get-sales-analytics',
  auth('ADMIN', 'SUPER_ADMIN'),
  SalesController.getSalesAnalytics
);

// 2. Parameterized Routes Last
router.get(
  '/get-sale-by-id/:id',
  auth('SALESMAN', 'ADMIN', 'SUPER_ADMIN'),
  SalesController.getSaleById
);

router.get(
  '/get-sales-by-customer/:phone',
  auth('SALESMAN', 'ADMIN', 'SUPER_ADMIN'),
  SalesController.getSalesByCustomer
);

router.patch(
  '/update-sale-status/:id',
  auth('SALESMAN', 'ADMIN', 'SUPER_ADMIN'),
  SalesController.updateSaleStatus
);

// Update full sale route
router.patch(
  '/update-sale/:id',
  auth('SUPER_ADMIN', 'ADMIN', 'SALESMAN'),
  SalesController.updateSale
);

// Delete sale route
router.delete(
  '/delete-sale/:id',
  auth('SUPER_ADMIN', 'ADMIN'), // Typically restricted to Admins
  SalesController.deleteSale
);

export const SalesRoutes = router;