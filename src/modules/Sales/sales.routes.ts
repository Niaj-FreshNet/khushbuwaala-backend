import { Router } from 'express';
import { SalesController } from './sales.controller';
import auth from '../../middlewares/auth';

const router = Router();

// Create a manual sale (done by SALESMAN or ADMIN)
router.post(
  '/create-sale',
  auth('SALESMAN', 'ADMIN', 'SUPER_ADMIN'),
  SalesController.createSale
);

// Get all sales (admin overview)
router.get('/get-all-sales', auth('ADMIN', 'SUPER_ADMIN'), SalesController.getAllSales);

// Get sales by salesman (each salesman sees his own)
router.get('/my-sales', auth('SALESMAN', 'ADMIN', 'SUPER_ADMIN'), SalesController.getMySales);


router.get('/get-sale-by-id/:id', auth('SALESMAN', 'ADMIN', 'SUPER_ADMIN'), SalesController.getSaleById);

// Get sales by customer phone/name (walk-in tracking)
router.get('/get-sales-by-customer/:phone', auth('SALESMAN', 'ADMIN', 'SUPER_ADMIN'), SalesController.getSalesByCustomer);

// Update sale status (delivered/cancelled etc.)
router.patch(
  '/update-sale-status/:id',
  auth('SALESMAN', 'ADMIN', 'SUPER_ADMIN'),
  SalesController.updateSaleStatus
);

// Analytics for sales performance
router.get('/get-sales-analytics', auth('ADMIN', 'SUPER_ADMIN'), SalesController.getSalesAnalytics);

export const SalesRoutes = router;
