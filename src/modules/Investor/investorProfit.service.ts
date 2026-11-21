import httpStatus from 'http-status';
import { prisma } from '../../../prisma/client';
import AppError from '../../errors/AppError';
import { FinanceServices } from '../Finance/finance.service';

/**
 * Monthly investor profit share (DECISIONS D-006):
 *   share = company net profit for the month (after all expenses) × investor %.
 * Credited to the investor's balance only when SUPER_ADMIN approves the month.
 * Loss months credit 0 (no carry-forward). Each investor/month is credited at most once.
 */

const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const round2 = (n: number) => Math.round(n * 100) / 100;

const validateMonth = (year: number, month: number) => {
  if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Choose a valid year and month.');
  }
};

// A month is closed once the Dhaka calendar has moved past it.
const isClosedMonth = (year: number, month: number) => {
  const dhakaNow = new Date(Date.now() + 6 * 3600 * 1000);
  const cy = dhakaNow.getUTCFullYear();
  const cm = dhakaNow.getUTCMonth() + 1;
  return year < cy || (year === cy && month < cm);
};

const monthNetProfit = async (year: number, month: number) => {
  const summary = await FinanceServices.getFinancialSummary({
    startDate: `${year}-${pad(month)}-01`,
    endDate: `${year}-${pad(month)}-${pad(lastDay(year, month))}`,
  });
  return { netProfit: round2(summary.metrics.netProfit || 0), summary };
};

/** What each investor would get for a month, and what was already credited. */
const previewMonth = async (year: number, month: number) => {
  validateMonth(year, month);
  const [{ netProfit, summary }, investors] = await Promise.all([
    monthNetProfit(year, month),
    prisma.investor.findMany({
      include: {
        user: { select: { name: true, email: true } },
        monthlyProfits: { where: { year, month } },
      },
    }),
  ]);

  const rows = investors.map((inv) => {
    const record = inv.monthlyProfits[0];
    const proposedShare = round2(Math.max(0, netProfit) * (inv.profitSharePercentage / 100));
    return {
      investorId: inv.id,
      name: inv.user?.name,
      email: inv.user?.email,
      sharePercentage: inv.profitSharePercentage,
      proposedShare,
      credited: record?.isDistributed
        ? { amount: record.shareAmount, sharePercentage: record.sharePercentage, companyNetProfit: record.companyNetProfit, at: record.distributedAt }
        : null,
    };
  });

  return {
    year,
    month,
    isClosed: isClosedMonth(year, month),
    companyNetProfit: netProfit,
    isLoss: netProfit < 0,
    metrics: {
      totalRevenue: summary.metrics.totalRevenue,
      grossProfit: summary.metrics.grossProfit,
      totalOperatingExpenses: summary.metrics.totalOperatingExpenses,
      totalFulfillmentCosts: summary.metrics.totalFulfillmentCosts,
    },
    investors: rows,
    allCredited: rows.length > 0 && rows.every((r) => r.credited),
  };
};

/** Credit every not-yet-credited investor for a closed month. Safe to call twice. */
// `onlyInvestorIds` is internal (tests / single-investor fixes); the API always approves everyone.
const approveMonth = async (year: number, month: number, approverId: string, onlyInvestorIds?: string[]) => {
  validateMonth(year, month);
  if (!isClosedMonth(year, month)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'This month is not finished yet. You can approve it from the 1st of next month.');
  }

  // Numbers are computed at approval time, so they match what the Finance page shows now.
  const { netProfit } = await monthNetProfit(year, month);
  const investors = await prisma.investor.findMany(onlyInvestorIds ? { where: { id: { in: onlyInvestorIds } } } : undefined);
  const results: { investorId: string; amount: number; status: 'credited' | 'already-credited' }[] = [];

  for (const inv of investors) {
    const amount = round2(Math.max(0, netProfit) * (inv.profitSharePercentage / 100));
    const outcome = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.investorMonthlyProfit.findUnique({
          where: { investorId_year_month: { investorId: inv.id, year, month } },
        });
        if (existing?.isDistributed) return 'already-credited' as const;

        const record =
          existing ??
          (await tx.investorMonthlyProfit.create({
            data: { investorId: inv.id, year, month, companyNetProfit: netProfit, shareAmount: amount, isDistributed: false },
          }));

        // Guarded flip: only one approval can move it to distributed, so the balance is
        // credited exactly once even if two approvals run at the same time.
        const flipped = await tx.investorMonthlyProfit.updateMany({
          where: { id: record.id, isDistributed: false },
          data: {
            isDistributed: true,
            companyNetProfit: netProfit,
            shareAmount: amount,
            sharePercentage: inv.profitSharePercentage,
            distributedAt: new Date(),
            distributedById: approverId,
          },
        });
        if (flipped.count !== 1) return 'already-credited' as const;

        if (amount > 0) {
          await tx.investor.update({ where: { id: inv.id }, data: { currentBalance: { increment: amount } } });
        }
        return 'credited' as const;
      },
      { maxWait: 10000, timeout: 15000 }
    );
    results.push({ investorId: inv.id, amount, status: outcome });
  }

  return {
    year,
    month,
    companyNetProfit: netProfit,
    credited: results.filter((r) => r.status === 'credited'),
    skipped: results.filter((r) => r.status === 'already-credited'),
  };
};

export const InvestorProfitServices = { previewMonth, approveMonth, isClosedMonth };
