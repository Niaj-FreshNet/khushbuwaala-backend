import { Router } from 'express';
import { OrderController } from './order.controller';
import auth from '../../middlewares/auth';

const router = Router();

// Create an order (customer flow)
router.post(
  '/create-order',
  auth('USER'),
  OrderController.createOrder
);

// Admin order management
router.get('/get-all-orders', auth('SUPER_ADMIN', 'ADMIN', 'SALESMAN'), OrderController.getAllOrders);
router.get('/get-order-by-id/:id', auth('SUPER_ADMIN', 'ADMIN', 'SALESMAN'), OrderController.getOrderById);
router.patch(
  '/update-order-status/:id',
  auth('SUPER_ADMIN', 'ADMIN', 'SALESMAN'),
  OrderController.updateOrderStatus,
);

// Customer management
router.get('/get-all-customers', auth('SUPER_ADMIN', 'ADMIN'), OrderController.getAllCustomers);

// User orders (customer)
router.get('/get-user-orders/:id', OrderController.getUserOrders);
router.get('/my-orders', auth('USER'), OrderController.getMyOrders);
router.get('/my-orders/:id', auth('USER'), OrderController.getMyOrderByID);

export const OrderRoutes = router;