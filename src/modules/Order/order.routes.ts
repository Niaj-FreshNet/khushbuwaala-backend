// File: order.route.ts
import { Router } from 'express';
import { OrderController } from './order.controller';
import auth from '../../middlewares/auth';
import { limits } from '../../middlewares/rateLimit';

const router = Router();

// Create an order (customer flow)
router.post(
  '/create-order',
  limits.createOrder,
  auth('OPTIONAL'),
  OrderController.createOrder
);

// Admin order management (Ensures req.user is populated with role)
router.get('/get-all-orders', auth('SUPER_ADMIN', 'ADMIN', 'SALESMAN'), OrderController.getAllOrders);

// Public order tracking (by ID, invoice, phone, or email)
router.get('/track/:query', limits.track, OrderController.trackOrders);

// Updated to authenticate so Super Admin gets profit data, while normal users/guests can still view via OPTIONAL/Token
router.get('/get-order-by-id/:id', auth('SUPER_ADMIN', 'ADMIN', 'SALESMAN', 'USER', 'OPTIONAL'), OrderController.getOrderById);

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
router.get("/dashboard/monthly-sales", auth('ADMIN', 'SUPER_ADMIN'), OrderController.getMonthlySalesOverview);

// Customer management
router.get('/get-all-customers', auth('SUPER_ADMIN', 'ADMIN'), OrderController.getAllCustomers);

// User orders (customer)
// Staff only: lists any customer's orders (was public).
router.get('/get-user-orders/:id', auth('ADMIN', 'SUPER_ADMIN'), OrderController.getUserOrders);
router.get('/my-orders', auth("USER", "SUPER_ADMIN", "ADMIN", "SALESMAN"), OrderController.getMyOrders);
router.get('/my-orders/:id', auth('USER'), OrderController.getMyOrderByID);

router.delete(
  '/delete-order/:id',
  auth('SUPER_ADMIN', 'ADMIN'),
  OrderController.deleteOrder
);

export const OrderRoutes = router;