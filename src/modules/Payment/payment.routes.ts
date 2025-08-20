import { Router } from 'express';
import { PaymentController } from './payment.controller';
import auth from '../../middlewares/auth';
const router = Router();

router.post(
  '/create-checkout-session',
  auth('ADMIN', 'USER'),
  PaymentController.createCheckoutSession,
);

router.post(
  '/get-all-payment-history',
  auth('ADMIN'),
  PaymentController.getAllPaymentHistory,
);

export const PaymentRoutes = router;
