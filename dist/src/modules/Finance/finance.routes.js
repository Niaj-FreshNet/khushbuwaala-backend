"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinanceRoutes = void 0;
const express_1 = __importDefault(require("express"));
const finance_controller_1 = require("./finance.controller");
const auth_1 = __importDefault(require("../../middlewares/auth"));
const router = express_1.default.Router();
// NOTE: You should protect all of these with auth(Role.ADMIN, Role.SUPER_ADMIN)
// Packaging Costs (Setup Phase)
router.post('/packaging/variant/:sku', (0, auth_1.default)('ADMIN', 'SUPER_ADMIN'), finance_controller_1.FinanceController.setVariantPackagingCost);
router.get('/packaging/variant/:sku', finance_controller_1.FinanceController.getPackagingCost);
// Stock Purchases & WAC (Procurement Phase)
router.post('/procurement/purchase/:productId', (0, auth_1.default)('SUPER_ADMIN'), finance_controller_1.FinanceController.receiveStockPurchase);
router.get('/wac/:productId', (0, auth_1.default)('SUPER_ADMIN'), finance_controller_1.FinanceController.getLiveWAC);
router.get('/analytics/summary', (0, auth_1.default)('SUPER_ADMIN', 'INVESTOR'), finance_controller_1.FinanceController.getFinancialSummary);
router.post('/backfill-historical-costs', (0, auth_1.default)('SUPER_ADMIN'), finance_controller_1.FinanceController.backfillHistoricalCosts);
router.patch('/override-profit/:orderId', (0, auth_1.default)('SUPER_ADMIN'), finance_controller_1.FinanceController.overrideOrderProfit);
router.get('/ledger', (0, auth_1.default)('SUPER_ADMIN', 'INVESTOR'), finance_controller_1.FinanceController.getLedger);
exports.FinanceRoutes = router;
