import { Prisma, PrismaClient, ExpenseStatus } from '@prisma/client';
import { PrismaQueryBuilder } from '../../builder/QueryBuilder';
import { prisma } from '../../../prisma/client';
import httpStatus from 'http-status';
import AppError from '../../errors/AppError';

const createExpense = async (
  payload: {
    expenseTime: string;
    title: string;
    description?: string;
    amount: number;
    method: string;
    isPaid?: boolean;
    status?: ExpenseStatus;
    reference?: string;
  },
  userId: string
) => {
  const { expenseTime, title, description, amount, method, isPaid, status, reference } = payload;

  const expense = await prisma.expense.create({
    data: {
      expenseTime: new Date(expenseTime),
      title,
      description,
      amount: Number(amount),
      method,
      isPaid: isPaid || false,
      status: status || 'PENDING',
      reference,
      expenseById: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    include: {
      expenseBy: { select: { id: true, name: true } },
    },
  });

  return expense;
};

const getAllExpenses = async (queryParams: Record<string, unknown>) => {
  const { searchTerm, status, ...rest } = queryParams as {
    searchTerm?: string;
    status?: ExpenseStatus | string;
  };

  const queryBuilder = new PrismaQueryBuilder(rest);
  const prismaQuery = queryBuilder
    .buildWhere()
    .buildSort()
    .buildPagination()
    .getQuery();

  const where: Prisma.ExpenseWhereInput = {
    ...prismaQuery.where,
  };

  if (status) where.status = status as ExpenseStatus;

  if (searchTerm && searchTerm.trim()) {
    const s = searchTerm.trim();
    where.OR = [
      { title: { contains: s, mode: 'insensitive' } },
      { description: { contains: s, mode: 'insensitive' } },
      { reference: { contains: s, mode: 'insensitive' } },
      {
        expenseBy: {
          name: { contains: s, mode: 'insensitive' },
        },
      },
    ];
  }

  const data = await prisma.expense.findMany({
    ...prismaQuery,
    where,
    include: {
      expenseBy: { select: { id: true, name: true } },
    },
  });

  const meta = await queryBuilder.getPaginationMeta({
    count: (args: any) =>
      prisma.expense.count({ where: { ...where, ...(args?.where ?? {}) } }),
  });

  return { meta, data };
};

const getExpenseById = async (id: string) => {
  const expense = await prisma.expense.findUnique({
    where: { id },
    include: {
      expenseBy: { select: { id: true, name: true } },
    },
  });

  if (!expense) throw new AppError(httpStatus.NOT_FOUND, 'Expense not found');

  return expense;
};

const updateExpenseStatus = async (
  id: string,
  payload: Partial<Pick<Prisma.ExpenseUpdateInput, 'status' | 'isPaid'>>
) => {
  const data: Prisma.ExpenseUpdateInput = {};
  if (payload.status) data.status = payload.status as ExpenseStatus;
  if (typeof payload.isPaid === 'boolean') data.isPaid = payload.isPaid;

  const updated = await prisma.expense.update({
    where: { id },
    data,
    include: {
      expenseBy: { select: { id: true, name: true } },
    },
  });

  return updated;
};

const getExpenseAnalytics = async (queryParams: Record<string, unknown>) => {
  const { startDate, endDate } = queryParams as {
    startDate?: string;
    endDate?: string;
  };

  const where: Prisma.ExpenseWhereInput = {};

  if (startDate || endDate) {
    where.expenseTime = {};
    if (startDate) (where.expenseTime as any).gte = new Date(startDate);
    if (endDate) (where.expenseTime as any).lte = new Date(endDate);
  }

  const [count, sum, byStatus] = await Promise.all([
    prisma.expense.count({ where }),
    prisma.expense.aggregate({ where, _sum: { amount: true } }),
    prisma.expense.groupBy({
      by: ['status'],
      _count: { _all: true },
      _sum: { amount: true },
      where,
    }),
  ]);

  return {
    totalExpenses: count,
    totalAmount: sum._sum.amount ?? 0,
    byStatus,
  };
};

export const ExpenseServices = {
  createExpense,
  getAllExpenses,
  getExpenseById,
  updateExpenseStatus,
  getExpenseAnalytics,
};