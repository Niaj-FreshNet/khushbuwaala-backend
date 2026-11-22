import { Router } from 'express';
import * as steadfastController from './steadfast.controller';
import auth from '../../middlewares/auth';

const router = Router();

// Booking a courier costs money and reveals customer data: staff only (both were public).
router.post('/send-order/:orderId', auth('SALESMAN', 'ADMIN', 'SUPER_ADMIN'), steadfastController.sendOrderToSteadfast);
router.get('/balance', auth('ADMIN', 'SUPER_ADMIN'), steadfastController.getBalance);

// Raw body is captured by the global express.json({ verify }) in app.ts.
// (A route-level express.raw never ran after the global JSON parser, so every call crashed.)
router.post('/webhook', steadfastController.handleWebhook);

// Courier settlement (D-026): payouts ("Cleared"), sync, things to check
router.get('/payouts', auth('ADMIN', 'SUPER_ADMIN'), steadfastController.getPayouts);
router.post('/sync', auth('ADMIN', 'SUPER_ADMIN'), steadfastController.syncCourier);
router.get('/sync/last', auth('ADMIN', 'SUPER_ADMIN'), steadfastController.lastCourierSync);
router.get('/review', auth('ADMIN', 'SUPER_ADMIN'), steadfastController.getCourierReview);
router.patch('/review/:orderId/resolve', auth('ADMIN', 'SUPER_ADMIN'), steadfastController.resolveCourierReview);

export const SteadfastRoutes = router;