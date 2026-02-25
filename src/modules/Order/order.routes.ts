import { Router } from 'express';
import { OrderController } from './order.controller';
import auth from '../../middlewares/auth';

const router = Router();

// Create an order (customer flow)
router.post(
  '/create-order',
  auth('OPTIONAL'),
  OrderController.createOrder
);

// Admin order management
router.get('/get-all-orders', auth('SUPER_ADMIN', 'ADMIN', 'SALESMAN'), OrderController.getAllOrders);
router.get('/get-order-by-id/:id', auth('OPTIONAL'), OrderController.getOrderById);
router.patch(
  '/update-order-status/:id',
  auth('SUPER_ADMIN', 'ADMIN', 'SALESMAN'),
  OrderController.updateOrderStatus,
);
router.patch(
  '/update-payment-status/:id',
  auth('SUPER_ADMIN', 'ADMIN', 'SALESMAN'),
  OrderController.updatePaymentStatus,
);
router.patch(
  '/update-order/:id',
  auth('SUPER_ADMIN', 'ADMIN', 'SALESMAN'),
  OrderController.updateOrder,
);

router.get("/dashboard/metrics", auth('ADMIN', 'SUPER_ADMIN'), OrderController.getDashboardMetrics);
router.get("/dashboard/weekly-sales", auth('ADMIN', 'SUPER_ADMIN'), OrderController.getWeeklySalesOverview);

// Customer management
router.get('/get-all-customers', auth('SUPER_ADMIN', 'ADMIN'), OrderController.getAllCustomers);

// User orders (customer)
router.get('/get-user-orders/:id', OrderController.getUserOrders);
router.get('/my-orders', auth("USER", "SUPER_ADMIN", "ADMIN", "SALESMAN"), OrderController.getMyOrders);
router.get('/my-orders/:id', auth('USER'), OrderController.getMyOrderByID);

export const OrderRoutes = router;