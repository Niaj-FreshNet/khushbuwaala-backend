import { Router } from 'express';
import { SaleController } from './sale.controller';
import auth from '../../middlewares/auth';
const router = Router();

router.get('/add-sale', auth('ADMIN'), SaleController.addSale);
router.get('/get-all-sales', auth('ADMIN'), SaleController.getAllSales);
router.get('/get-sale-by-id/:id', auth('ADMIN'), SaleController.getSaleById);
router.patch(
  '/update-sale-status/:id',
  auth('ADMIN'),
  SaleController.updateSaleStatus,
);
router.get(
  '/get-all-salesmans',
  auth('ADMIN'),
  SaleController.getAllSalesman,
);
router.get('/get-user-sales/:id', SaleController.getUserSales);
router.get('/my-sales', auth('USER'), SaleController.getMySales);
router.get('/my-sales/:id', auth('USER'), SaleController.getMySaleByID);

export const SalesRoutes = router;
