import { prisma } from '../../../prisma/client';
import { FinanceServices } from '../Finance/finance.service';
import AppError from '../../errors/AppError';
import httpStatus from 'http-status';
import { Prisma, WithdrawalStatus } from '@prisma/client';
import { isEnumValue } from '../../utils/enumValue';

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

type InvestorMoney = { profitSharePercentage?: number; totalInvested?: number; currentBalance?: number };
const MONEY_FIELDS = ['totalInvested', 'currentBalance', 'profitSharePercentage'] as const;

/** A number that was actually sent (blank / missing = leave unchanged). */
export const sentNumber = (v: unknown, label: string) => {
    if (v === undefined || v === null || v === '') return undefined;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new AppError(httpStatus.BAD_REQUEST, `${label} must be a number, 0 or more`);
    return n;
};

/** Record each changed money field, inside the same transaction as the change. */
export const logInvestorAdjustments = async (
    tx: Prisma.TransactionClient,
    investorId: string,
    before: InvestorMoney,
    after: InvestorMoney,
    source: 'MANAGE_INVESTORS' | 'ROLE_MANAGER',
    byId?: string,
    note?: string
) => {
    for (const field of MONEY_FIELDS) {
        const b = Number(before[field] ?? 0);
        const a = after[field];
        if (a === undefined || a === b) continue;
        await tx.investorAdjustment.create({ data: { investorId, field, before: b, after: a, source, byId: byId || null, note: note || null } });
    }
};

const updateInvestorData = async (
    investorId: string,
    payload: { profitSharePercentage?: unknown; totalInvested?: unknown; currentBalance?: unknown; note?: string },
    byId?: string
) => {
    // Only fields that were sent change. (Number(undefined) used to save NaN.)
    const next: InvestorMoney = {
        profitSharePercentage: sentNumber(payload.profitSharePercentage, 'Profit share %'),
        totalInvested: sentNumber(payload.totalInvested, 'Total invested'),
        currentBalance: sentNumber(payload.currentBalance, 'Current balance'),
    };
    if (next.profitSharePercentage !== undefined && next.profitSharePercentage > 100) {
        throw new AppError(httpStatus.BAD_REQUEST, 'Profit share % cannot be above 100');
    }

    return await prisma.$transaction(async (tx) => {
        const investor = await tx.investor.findUnique({ where: { id: investorId } });
        if (!investor) throw new AppError(httpStatus.NOT_FOUND, "Investor not found");

        await logInvestorAdjustments(tx, investorId, investor, next, 'MANAGE_INVESTORS', byId, payload.note);
        return tx.investor.update({
            where: { id: investorId },
            data: Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined)),
            include: { user: { select: { name: true, email: true } } },
        });
    });
};

/**
 * Reconciliation (SUPER_ADMIN): each investor's stored balance next to what the records explain:
 * manual balance changes + credited monthly profit - approved/completed withdrawals.
 * What is left is the opening balance typed in by hand before records existed (2026-11-22).
 */
const reconcileInvestors = async () => {
    const investors = await prisma.investor.findMany({
        include: {
            user: { select: { name: true, email: true } },
            withdrawals: { select: { amount: true, status: true } },
            monthlyProfits: { select: { shareAmount: true, isDistributed: true } },
        },
    });
    const adjustments = await prisma.investorAdjustment.findMany({ orderBy: { createdAt: 'asc' } });
    const round = (n: number) => Math.round(n * 100) / 100;
    return investors.map((inv) => {
        const withdrawn = inv.withdrawals.filter((w) => w.status === 'APPROVED' || w.status === 'COMPLETED').reduce((s, w) => s + w.amount, 0);
        const credited = inv.monthlyProfits.filter((m) => m.isDistributed).reduce((s, m) => s + m.shareAmount, 0);
        const mine = adjustments.filter((a) => a.investorId === inv.id);
        const manual = mine.filter((a) => a.field === 'currentBalance').reduce((s, a) => s + (a.after - a.before), 0);
        return {
            investorId: inv.id,
            name: inv.user?.name,
            totalInvested: inv.totalInvested,
            currentBalance: inv.currentBalance,
            creditedProfit: round(credited),
            withdrawn: round(withdrawn),
            manualBalanceChanges: round(manual),
            openingBalance: round(inv.currentBalance - manual - credited + withdrawn),
            adjustments: mine,
        };
    });
};

const getAllWithdrawals = async (status?: string) => {
    // an unknown status used to reach Prisma and fail; it now just lists everything
    const where: Prisma.InvestorWithdrawalWhereInput = isEnumValue(WithdrawalStatus, status) ? { status } : {};

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

    // Allowed moves only. The balance is deducted exactly once: when money is committed
    // (PENDING → APPROVED, or PENDING → COMPLETED in one step).
    const allowed: Record<string, string[]> = {
        PENDING: ['APPROVED', 'REJECTED', 'COMPLETED'],
        APPROVED: ['COMPLETED'],
    };
    if (!(allowed[withdrawal.status] || []).includes(status)) {
        throw new AppError(httpStatus.BAD_REQUEST, `Cannot change a ${withdrawal.status} withdrawal to ${status}.`);
    }
    const deductNow = withdrawal.status === 'PENDING' && (status === 'APPROVED' || status === 'COMPLETED');

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

        // 2. Deduct once, when the money is committed. Read the balance inside the transaction
        //    so two approvals at the same time can't both pass the check.
        if (deductNow) {
            const investor = await tx.investor.findUnique({ where: { id: withdrawal.investorId } });
            if (!investor || investor.currentBalance < withdrawal.amount) {
                throw new AppError(httpStatus.BAD_REQUEST, "Investor has insufficient balance for this withdrawal.");
            }

            await tx.investor.update({
                where: { id: withdrawal.investorId },
                data: {
                    currentBalance: { decrement: withdrawal.amount }
                }
            });
        }

        // REJECTED never touches the balance; APPROVED → COMPLETED was already deducted on approval.
        return updatedWithdrawal;
    });
};

export const InvestorServices = {
    getInvestorDashboardData,
    requestWithdrawal,
    getAllInvestors,
    updateInvestorData,
    reconcileInvestors,
    getAllWithdrawals,
    updateWithdrawalStatus,
};