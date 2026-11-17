import httpStatus from 'http-status';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import AppError from '../../errors/AppError';
import { FinanceServices } from './finance.service';

const setVariantPackagingCost = catchAsync(async (req, res) => {
    const { sku } = req.params;
    const { costLines } = req.body;

    if (!costLines || !Array.isArray(costLines)) {
        throw new AppError(httpStatus.BAD_REQUEST, 'costLines array is required');
    }

    const result = await FinanceServices.upsertVariantPackagingCost(sku, { costLines });

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Variant packaging costs updated successfully',
        data: result,
    });
});

const getPackagingCost = catchAsync(async (req, res) => {
    const { sku } = req.params;
    const result = await FinanceServices.getPackagingCostsBySku(sku);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Packaging costs retrieved',
        data: result,
    });
});

const receiveStockPurchase = catchAsync(async (req, res) => {
    const { productId } = req.params;

    // Assume user is attached to req from auth middleware
    const createdById = (req as any).user?.id;

    const payload = { ...req.body, productId, createdById };

    if (!payload.quantity || !payload.costLines) {
        throw new AppError(httpStatus.BAD_REQUEST, 'quantity and costLines are required');
    }

    const result = await FinanceServices.addStockPurchaseAndUpdateWAC(payload);

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: 'Stock purchase recorded and WAC updated successfully',
        data: result,
    });
});

const getLiveWAC = catchAsync(async (req, res) => {
    const { productId } = req.params;
    const result = await FinanceServices.getProductLiveWAC(productId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Live product costs retrieved',
        data: result || { avgCostPerUnit: 0, lastCostPerUnit: 0 },
    });
});

const getFinancialSummary = catchAsync(async (req, res) => {
    const { startDate, endDate } = req.query;
    const result = await FinanceServices.getFinancialSummary({
        startDate: startDate as string,
        endDate: endDate as string,
    });

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Financial P&L summary retrieved successfully',
        data: result,
    });
});

const backfillHistoricalCosts = catchAsync(async (req, res) => {
    const { orderIds } = req.body;
    const result = await FinanceServices.backfillHistoricalOrderCosts(orderIds);
    sendResponse(res, {
        statusCode: 200,
        success: true,
        message: result.message,
        data: result,
    });
});

const overrideOrderProfit = catchAsync(async (req, res) => {
    const { orderId } = req.params;
    const { profit } = req.body;
    const result = await FinanceServices.overrideOrderProfit(orderId, Number(profit));
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Order profit overridden successfully',
        data: result,
    });
});

const getLedger = catchAsync(async (req, res) => {
    const result = await FinanceServices.getLedgerTransactions(req.query);
    sendResponse(res, 
        { statusCode: 200, 
            success: true, 
            message: 'Ledger fetched', 
            data: result });
});


export const FinanceController = {
    setVariantPackagingCost,
    getPackagingCost,
    receiveStockPurchase,
    getLiveWAC,
    getFinancialSummary,
    backfillHistoricalCosts,
    overrideOrderProfit,
    getLedger,
};