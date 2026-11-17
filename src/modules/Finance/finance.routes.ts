import express from 'express';
import { FinanceController } from './finance.controller';
import auth from '../../middlewares/auth';

const router = express.Router();

// NOTE: You should protect all of these with auth(Role.ADMIN, Role.SUPER_ADMIN)

// Packaging Costs (Setup Phase)
router.post('/packaging/variant/:sku', auth('ADMIN', 'SUPER_ADMIN'), FinanceController.setVariantPackagingCost);
router.get('/packaging/variant/:sku', FinanceController.getPackagingCost);

// Stock Purchases & WAC (Procurement Phase)
router.post('/procurement/purchase/:productId', auth('SUPER_ADMIN'), FinanceController.receiveStockPurchase);
router.get('/wac/:productId', auth('SUPER_ADMIN'), FinanceController.getLiveWAC);

router.get('/analytics/summary', auth('SUPER_ADMIN'), FinanceController.getFinancialSummary);

router.post('/backfill-historical-costs', auth('SUPER_ADMIN'), FinanceController.backfillHistoricalCosts);
router.patch(
    '/override-profit/:orderId',
    auth('SUPER_ADMIN'),
    FinanceController.overrideOrderProfit
);

router.get('/ledger', auth('ADMIN', 'SUPER_ADMIN'), FinanceController.getLedger);

export const FinanceRoutes = router;