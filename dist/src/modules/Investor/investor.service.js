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
exports.InvestorServices = void 0;
const client_1 = require("../../../prisma/client");
const finance_service_1 = require("../Finance/finance.service");
const AppError_1 = __importDefault(require("../../errors/AppError"));
const http_status_1 = __importDefault(require("http-status"));
const getInvestorDashboardData = (userId, userRole, query) => __awaiter(void 0, void 0, void 0, function* () {
    if (userRole !== 'INVESTOR' && userRole !== 'SUPER_ADMIN') {
        throw new AppError_1.default(http_status_1.default.FORBIDDEN, "Unauthorized access to investor dashboard.");
    }
    const investorRecord = yield client_1.prisma.investor.findUnique({
        where: { userId },
        include: {
            user: { select: { name: true, email: true } },
            withdrawals: {
                orderBy: { createdAt: 'desc' },
                take: 10
            },
            monthlyProfits: {
                orderBy: [
                    { year: 'desc' },
                    { month: 'desc' }
                ],
                take: 12
            }
        }
    });
    if (!investorRecord && userRole === 'INVESTOR') {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Investor profile not initialized. Contact Super Admin.");
    }
    // Fetch Company wide financials
    const financialSummary = yield finance_service_1.FinanceServices.getFinancialSummary(query);
    // Safely scale numbers by their strict database percentage
    const sharePct = (investorRecord === null || investorRecord === void 0 ? void 0 : investorRecord.profitSharePercentage) || 0;
    const multiplier = sharePct / 100;
    const scaledMetrics = {
        grossSales: (financialSummary.metrics.grossSales || 0) * multiplier,
        totalRevenue: (financialSummary.metrics.totalRevenue || 0) * multiplier,
        totalCOGS: (financialSummary.metrics.totalCOGS || 0) * multiplier,
        grossProfit: (financialSummary.metrics.grossProfit || 0) * multiplier,
        totalFulfillmentCosts: (financialSummary.metrics.totalFulfillmentCosts || 0) * multiplier,
        totalOperatingExpenses: (financialSummary.metrics.totalOperatingExpenses || 0) * multiplier,
        netProfit: (financialSummary.metrics.netProfit || 0) * multiplier,
        totalOrderDiscounts: (financialSummary.metrics.totalOrderDiscounts || 0) * multiplier,
        returnedCourierLoss: (financialSummary.metrics.returnedCourierLoss || 0) * multiplier,
    };
    return {
        period: financialSummary.period,
        investorProfile: {
            name: investorRecord === null || investorRecord === void 0 ? void 0 : investorRecord.user.name,
            email: investorRecord === null || investorRecord === void 0 ? void 0 : investorRecord.user.email,
            profitSharePercentage: sharePct,
            totalInvested: (investorRecord === null || investorRecord === void 0 ? void 0 : investorRecord.totalInvested) || 0,
            currentBalance: (investorRecord === null || investorRecord === void 0 ? void 0 : investorRecord.currentBalance) || 0,
        },
        metrics: scaledMetrics,
        recentWithdrawals: (investorRecord === null || investorRecord === void 0 ? void 0 : investorRecord.withdrawals) || [],
        monthlyProfits: (investorRecord === null || investorRecord === void 0 ? void 0 : investorRecord.monthlyProfits) || [],
    };
});
const requestWithdrawal = (userId, amount, method, note) => __awaiter(void 0, void 0, void 0, function* () {
    const investor = yield client_1.prisma.investor.findUnique({ where: { userId } });
    if (!investor)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Investor profile not found.");
    if (amount <= 0) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Withdrawal amount must be greater than zero.");
    }
    if (amount > investor.currentBalance) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Insufficient available balance for withdrawal.");
    }
    return yield client_1.prisma.investorWithdrawal.create({
        data: {
            investorId: investor.id,
            amount: Number(amount),
            method,
            note,
            status: 'PENDING'
        }
    });
});
const getAllInvestors = () => __awaiter(void 0, void 0, void 0, function* () {
    // Fetch all investors along with their user details
    return yield client_1.prisma.investor.findMany({
        include: {
            user: {
                select: { name: true, email: true, isApproved: true, phone: true }
            }
        },
        orderBy: { createdAt: 'desc' }
    });
});
const updateInvestorData = (investorId, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const { profitSharePercentage, totalInvested, currentBalance } = payload;
    const investor = yield client_1.prisma.investor.findUnique({ where: { id: investorId } });
    if (!investor)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Investor not found");
    return yield client_1.prisma.investor.update({
        where: { id: investorId },
        data: {
            profitSharePercentage: Number(profitSharePercentage),
            totalInvested: Number(totalInvested),
            currentBalance: Number(currentBalance),
        },
        include: {
            user: { select: { name: true, email: true } }
        }
    });
});
const getAllWithdrawals = (status) => __awaiter(void 0, void 0, void 0, function* () {
    const where = status && status !== 'ALL' ? { status: status } : {};
    return yield client_1.prisma.investorWithdrawal.findMany({
        where,
        include: {
            investor: {
                include: { user: { select: { name: true, email: true } } }
            }
        },
        orderBy: { createdAt: 'desc' }
    });
});
const updateWithdrawalStatus = (withdrawalId, status, reference) => __awaiter(void 0, void 0, void 0, function* () {
    const withdrawal = yield client_1.prisma.investorWithdrawal.findUnique({
        where: { id: withdrawalId },
        include: { investor: true }
    });
    if (!withdrawal)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "Withdrawal not found.");
    if (withdrawal.status !== 'PENDING' && status !== 'COMPLETED') {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, `Cannot change status from ${withdrawal.status}.`);
    }
    return yield client_1.prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
        // 1. Update the withdrawal record
        const updatedWithdrawal = yield tx.investorWithdrawal.update({
            where: { id: withdrawalId },
            data: {
                status,
                reference: reference || withdrawal.reference,
                processedAt: (status === 'APPROVED' || status === 'COMPLETED') ? new Date() : null,
            }
        });
        // 2. If it is being APPROVED, deduct the amount from the investor's balance
        if (status === 'APPROVED') {
            if (withdrawal.investor.currentBalance < withdrawal.amount) {
                throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Investor has insufficient balance for this withdrawal.");
            }
            yield tx.investor.update({
                where: { id: withdrawal.investorId },
                data: {
                    currentBalance: { decrement: withdrawal.amount }
                }
            });
        }
        // Note: If REJECTED, we don't touch the balance. If COMPLETED, it was already deducted during APPROVAL.
        return updatedWithdrawal;
    }));
});
exports.InvestorServices = {
    getInvestorDashboardData,
    requestWithdrawal,
    getAllInvestors,
    updateInvestorData,
    getAllWithdrawals,
    updateWithdrawalStatus,
};
