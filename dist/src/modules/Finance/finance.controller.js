"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinanceController = void 0;
const http_status_1 = __importDefault(require("http-status"));
const catchAsync_1 = __importDefault(require("../../utils/catchAsync"));
const sendResponse_1 = __importDefault(require("../../utils/sendResponse"));
const AppError_1 = __importDefault(require("../../errors/AppError"));
const finance_service_1 = require("./finance.service");
const setVariantPackagingCost = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { sku } = req.params;
    const { costLines } = req.body;
    if (!costLines || !Array.isArray(costLines)) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'costLines array is required');
    }
    const result = yield finance_service_1.FinanceServices.upsertVariantPackagingCost(sku, { costLines });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Variant packaging costs updated successfully',
        data: result,
    });
}));
const getPackagingCost = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { sku } = req.params;
    const result = yield finance_service_1.FinanceServices.getPackagingCostsBySku(sku);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Packaging costs retrieved',
        data: result,
    });
}));
const receiveStockPurchase = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { productId } = req.params;
    // Assume user is attached to req from auth middleware
    const createdById = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
    const payload = Object.assign(Object.assign({}, req.body), { productId, createdById });
    if (!payload.quantity || !payload.costLines) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'quantity and costLines are required');
    }
    const result = yield finance_service_1.FinanceServices.addStockPurchaseAndUpdateWAC(payload);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.CREATED,
        success: true,
        message: 'Stock purchase recorded and WAC updated successfully',
        data: result,
    });
}));
const getLiveWAC = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { productId } = req.params;
    const result = yield finance_service_1.FinanceServices.getProductLiveWAC(productId);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Live product costs retrieved',
        data: result || { avgCostPerUnit: 0, lastCostPerUnit: 0 },
    });
}));
const getFinancialSummary = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { startDate, endDate } = req.query;
    const result = yield finance_service_1.FinanceServices.getFinancialSummary({
        startDate: startDate,
        endDate: endDate,
    });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Financial P&L summary retrieved successfully',
        data: result,
    });
}));
const backfillHistoricalCosts = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { orderIds } = req.body;
    const result = yield finance_service_1.FinanceServices.backfillHistoricalOrderCosts(orderIds);
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: result.message,
        data: result,
    });
}));
const overrideOrderProfit = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { orderId } = req.params;
    const { profit } = req.body;
    const result = yield finance_service_1.FinanceServices.overrideOrderProfit(orderId, Number(profit));
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Order profit overridden successfully',
        data: result,
    });
}));
const getLedger = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield finance_service_1.FinanceServices.getLedgerTransactions(req.query);
    (0, sendResponse_1.default)(res, { statusCode: 200,
        success: true,
        message: 'Ledger fetched',
        data: result });
}));
exports.FinanceController = {
    setVariantPackagingCost,
    getPackagingCost,
    receiveStockPurchase,
    getLiveWAC,
    getFinancialSummary,
    backfillHistoricalCosts,
    overrideOrderProfit,
    getLedger,
};
