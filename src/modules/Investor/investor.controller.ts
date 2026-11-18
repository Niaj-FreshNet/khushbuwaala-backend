import httpStatus from 'http-status';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { InvestorServices } from './investor.service';

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

const updateInvestorData = catchAsync(async (req, res) => {
    const { id } = req.params;
    const result = await InvestorServices.updateInvestorData(id, req.body);
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

export const InvestorController = {
    getInvestorDashboard,
    requestWithdrawal,
    getAllInvestors,
    updateInvestorData,
    getAllWithdrawals,
    updateWithdrawalStatus,
};