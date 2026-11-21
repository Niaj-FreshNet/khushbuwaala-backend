import { Router } from 'express';
import express from 'express';
import * as steadfastController from './steadfast.controller';
import auth from '../../middlewares/auth';

const router = Router();

// Booking a courier costs money and reveals customer data: staff only (both were public).
router.post('/send-order/:orderId', auth('SALESMAN', 'ADMIN', 'SUPER_ADMIN'), steadfastController.sendOrderToSteadfast);
router.get('/balance', auth('ADMIN', 'SUPER_ADMIN'), steadfastController.getBalance);

router.post(
    '/webhook',
    express.raw({ type: 'application/json' }),
    (req, res, next) => {
        (req as any).rawBody = req.body;
        try {
            req.body = JSON.parse(req.body.toString());
        } catch (e) {
            req.body = {};
        }
        next();
    },
    steadfastController.handleWebhook
);

export const SteadfastRoutes = router;