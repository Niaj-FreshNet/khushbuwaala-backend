import { prisma } from '../../../prisma/client';
import { FinanceServices } from '../Finance/finance.service';
import AppError from '../../errors/AppError';
import httpStatus from 'http-status';

const getInvestorDashboardData = async (userId: string, userRole: string, query: { startDate?: string; endDate?: string }) => {
    if (userRole !== 'INVESTOR' && userRole !== 'SUPER_ADMIN') {
        throw new AppError(httpStatus.FORBIDDEN, "Unauthorized access to investor dashboard.");
    }

    const investorRecord = await prisma.investor.findUnique({
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
        throw new AppError(httpStatus.NOT_FOUND, "Investor profile not initialized. Contact Super Admin.");
    }

    // Fetch Company wide financials
    const financialSummary = await FinanceServices.getFinancialSummary(query);

    // Safely scale numbers by their strict database percentage
    const sharePct = investorRecord?.profitSharePercentage || 0;
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
            name: investorRecord?.user.name,
            email: investorRecord?.user.email,
            profitSharePercentage: sharePct,
            totalInvested: investorRecord?.totalInvested || 0,
            currentBalance: investorRecord?.currentBalance || 0,
        },
        metrics: scaledMetrics,
        recentWithdrawals: investorRecord?.withdrawals || [],
        monthlyProfits: investorRecord?.monthlyProfits || [],
    };
};

const requestWithdrawal = async (userId: string, amount: number, method: string, note?: string) => {
    const investor = await prisma.investor.findUnique({ where: { userId } });
    if (!investor) throw new AppError(httpStatus.NOT_FOUND, "Investor profile not found.");

    if (amount <= 0) {
        throw new AppError(httpStatus.BAD_REQUEST, "Withdrawal amount must be greater than zero.");
    }
    if (amount > investor.currentBalance) {
        throw new AppError(httpStatus.BAD_REQUEST, "Insufficient available balance for withdrawal.");
    }

    return await prisma.investorWithdrawal.create({
        data: {
            investorId: investor.id,
            amount: Number(amount),
            method,
            note,
            status: 'PENDING'
        }
    });
};

const getAllInvestors = async () => {
    // Fetch all investors along with their user details
    return await prisma.investor.findMany({
        include: {
            user: {
                select: { name: true, email: true, isApproved: true, phone: true }
            }
        },
        orderBy: { createdAt: 'desc' }
    });
};

const updateInvestorData = async (
    investorId: string,
    payload: { profitSharePercentage: number; totalInvested: number; currentBalance: number }
) => {
    const { profitSharePercentage, totalInvested, currentBalance } = payload;

    const investor = await prisma.investor.findUnique({ where: { id: investorId } });
    if (!investor) throw new AppError(httpStatus.NOT_FOUND, "Investor not found");

    return await prisma.investor.update({
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
};

const getAllWithdrawals = async (status?: string) => {
    const where = status && status !== 'ALL' ? { status: status as any } : {};

    return await prisma.investorWithdrawal.findMany({
        where,
        include: {
            investor: {
                include: { user: { select: { name: true, email: true } } }
            }
        },
        orderBy: { createdAt: 'desc' }
    });
};

const updateWithdrawalStatus = async (
    withdrawalId: string,
    status: 'APPROVED' | 'REJECTED' | 'COMPLETED',
    reference?: string
) => {
    const withdrawal = await prisma.investorWithdrawal.findUnique({
        where: { id: withdrawalId },
        include: { investor: true }
    });

    if (!withdrawal) throw new AppError(httpStatus.NOT_FOUND, "Withdrawal not found.");
    if (withdrawal.status !== 'PENDING' && status !== 'COMPLETED') {
        throw new AppError(httpStatus.BAD_REQUEST, `Cannot change status from ${withdrawal.status}.`);
    }

    return await prisma.$transaction(async (tx) => {
        // 1. Update the withdrawal record
        const updatedWithdrawal = await tx.investorWithdrawal.update({
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
                throw new AppError(httpStatus.BAD_REQUEST, "Investor has insufficient balance for this withdrawal.");
            }

            await tx.investor.update({
                where: { id: withdrawal.investorId },
                data: {
                    currentBalance: { decrement: withdrawal.amount }
                }
            });
        }

        // Note: If REJECTED, we don't touch the balance. If COMPLETED, it was already deducted during APPROVAL.
        return updatedWithdrawal;
    });
};

export const InvestorServices = {
    getInvestorDashboardData,
    requestWithdrawal,
    getAllInvestors,
    updateInvestorData,
    getAllWithdrawals,
    updateWithdrawalStatus,
};