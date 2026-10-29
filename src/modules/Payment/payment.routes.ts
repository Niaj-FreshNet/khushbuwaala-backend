import { Router } from 'express';
import { PaymentController } from './payment.controller';
import auth from '../../middlewares/auth';

const router = Router();

router.get(
  '/get-all-payment-history',
  auth('SUPER_ADMIN', 'ADMIN', 'SALESMAN'),
  PaymentController.getAllPaymentHistory
);

export const PaymentRoutes = router;