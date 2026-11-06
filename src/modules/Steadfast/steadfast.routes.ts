import { Router } from 'express';
import express from 'express';
import * as steadfastController from './steadfast.controller';

const router = Router();

router.post('/send-order/:orderId', steadfastController.sendOrderToSteadfast);
router.get('/balance', steadfastController.getBalance);

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