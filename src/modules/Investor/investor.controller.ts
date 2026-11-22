import httpStatus from 'http-status';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { InvestorServices } from './investor.service';
import { InvestorProfitServices } from './investorProfit.service';
import { LedgerAccessServices } from './ledgerAccess.service';

const getInvestorDashboard = catchAsync(async (req, res) => {
    const { startDate, endDate } = req.query;
    const userId = (req as any).user?.id || (req as any).user?.userId;
    const userRole = (req as any).user?.role;

    const result = await InvestorServices.getInvestorDashboardData(userId, userRole, {
        startDate: startDate as string,
        endDate: endDate as string,
    });

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Investor dashboard data retrieved successfully',
        data: result,
    });
});

const requestWithdrawal = catchAsync(async (req, res) => {
    const userId = (req as any).user?.id || (req as any).user?.userId;
    const { amount, method, note } = req.body;
    
    const result = await InvestorServices.requestWithdrawal(userId, amount, method, note);

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: 'Withdrawal request submitted successfully',
        data: result,
    });
});

const getAllInvestors = catchAsync(async (req, res) => {
    const result = await InvestorServices.getAllInvestors();
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'All investors retrieved successfully',
        data: result,
    });
});

const reconcileInvestors = catchAsync(async (_req, res) => {
    const result = await InvestorServices.reconcileInvestors();
    sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Investor balances reconciled', data: result });
});

const updateInvestorData = catchAsync(async (req, res) => {
    const { id } = req.params;
    const result = await InvestorServices.updateInvestorData(id, req.body, (req as any).user?.id);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Investor financial data updated successfully',
        data: result,
    });
});

const getAllWithdrawals = catchAsync(async (req, res) => {
    const { status } = req.query;
    const result = await InvestorServices.getAllWithdrawals(status as string);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Withdrawals retrieved successfully',
        data: result,
    });
});

const updateWithdrawalStatus = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { status, reference } = req.body;
    
    const result = await InvestorServices.updateWithdrawalStatus(id, status, reference);
    
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: `Withdrawal successfully marked as ${status}`,
        data: result,
    });
});

const uid = (req: any) => req.user?.id || req.user?.userId;

// ---- Monthly profit share (SUPER_ADMIN) ----
const previewProfitMonth = catchAsync(async (req, res) => {
    const year = Number(req.query.year), month = Number(req.query.month);
    const result = await InvestorProfitServices.previewMonth(year, month);
    sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Profit share preview', data: result });
});

const approveProfitMonth = catchAsync(async (req, res) => {
    const year = Number(req.body?.year), month = Number(req.body?.month);
    const result = await InvestorProfitServices.approveMonth(year, month, uid(req));
    sendResponse(res, { statusCode: httpStatus.OK, success: true, message: `Credited ${result.credited.length} investor(s)`, data: result });
});

// ---- Ledger access (investor requests, SUPER_ADMIN decides) ----
const requestLedgerAccess = catchAsync(async (req, res) => {
    const result = await LedgerAccessServices.requestAccess(uid(req), req.body?.reason);
    sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Request sent to the Super Admin', data: result });
});

const myLedgerAccess = catchAsync(async (req, res) => {
    const result = await LedgerAccessServices.myStatus(uid(req));
    sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Ledger access status', data: result });
});

const listLedgerAccess = catchAsync(async (req, res) => {
    const result = await LedgerAccessServices.listRequests(req.query.status as string | undefined);
    sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Ledger access requests', data: result });
});

const decideLedgerAccess = catchAsync(async (req, res) => {
    const result = await LedgerAccessServices.decide(req.params.id, req.body?.status, req.body?.hours, uid(req));
    sendResponse(res, { statusCode: httpStatus.OK, success: true, message: `Request ${String(result.status).toLowerCase()}`, data: result });
});

const revokeLedgerAccess = catchAsync(async (req, res) => {
    const result = await LedgerAccessServices.revoke(req.params.id);
    sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Access ended', data: result });
});

export const InvestorController = {
    previewProfitMonth,
    approveProfitMonth,
    requestLedgerAccess,
    myLedgerAccess,
    listLedgerAccess,
    decideLedgerAccess,
    revokeLedgerAccess,
    getInvestorDashboard,
    requestWithdrawal,
    getAllInvestors,
    updateInvestorData,
    reconcileInvestors,
    getAllWithdrawals,
    updateWithdrawalStatus,
};