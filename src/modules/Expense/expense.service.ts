import { Prisma, ExpenseStatus } from '@prisma/client';
import { PrismaQueryBuilder } from '../../builder/QueryBuilder';
import { prisma } from '../../../prisma/client';
import httpStatus from 'http-status';
import AppError from '../../errors/AppError';
import { dhakaDayEnd, dhakaDayStart } from '../../utils/dhakaTime';
import { EXPENSE_CATEGORY_VALUES, UNCATEGORIZED } from './expense.constant';

const normalizeCategory = (value: unknown): string | null => {
  if (value === undefined || value === null || value === '') return null;
  const v = String(value).toUpperCase();
  if (!EXPENSE_CATEGORY_VALUES.includes(v)) {
    throw new AppError(httpStatus.BAD_REQUEST, `Unknown expense category: ${value}`);
  }
  return v;
};

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
    category?: string;
  },
  userId: string
) => {
  const { expenseTime, title, description, amount, method, isPaid, status, reference } = payload;
  const category = normalizeCategory(payload.category);
  if (!(Number(amount) > 0)) throw new AppError(httpStatus.BAD_REQUEST, 'Amount must be greater than 0');
  // No date = now; a date that can't be read is the caller's mistake (it used to crash with a 500)
  const when = expenseTime ? new Date(expenseTime) : new Date();
  if (Number.isNaN(when.getTime())) throw new AppError(httpStatus.BAD_REQUEST, 'Expense date is not valid');

  const expense = await prisma.expense.create({
    data: {
      expenseTime: when,
      title,
      description: description || '',
      amount: Number(amount),
      method,
      isPaid: isPaid ?? false,
      status: status || 'PENDING',
      reference: reference || '',
      category,
      expenseById: userId,
    },
    include: {
      expenseBy: { select: { id: true, name: true } },
    },
  });

  return expense;
};

// ownerId: set for SALESMAN callers, who only see and update the expenses they recorded (A-25).
const getAllExpenses = async (queryParams: Record<string, unknown>, ownerId?: string) => {
  const { searchTerm, status, isPaid, method, dateFrom, dateTo, category, ...rest } = queryParams as {
    category?: string;
    searchTerm?: string;
    status?: string;
    isPaid?: string | boolean;
    method?: string;
    dateFrom?: string;
    dateTo?: string;
  };

  const queryBuilder = new PrismaQueryBuilder(rest);
  const prismaQuery = queryBuilder
    .buildWhere()
    .buildSort()
    .buildPagination()
    .getQuery();

  const where: Prisma.ExpenseWhereInput = {
    ...prismaQuery.where,
    ...(ownerId ? { expenseById: ownerId } : {}),
  };

  // Exact Match Filters
  if (status && status !== 'ALL') {
    where.status = status as ExpenseStatus;
  }

  if (method && method !== 'ALL') {
    where.method = method;
  }

  if (category && category !== 'ALL') {
    if (category === UNCATEGORIZED) {
      where.AND = [{ OR: [{ category: null }, { category: { isSet: false } }] }];
    } else {
      where.category = String(category).toUpperCase();
    }
  }

  if (isPaid !== undefined && isPaid !== 'ALL') {
    where.isPaid = isPaid === 'true' || isPaid === true;
  }

  // Financial Period Alignment
  if (dateFrom || dateTo) {
    // Calendar days in Bangladesh time (the server runs in UTC)
    where.expenseTime = {
      ...(dateFrom ? { gte: dhakaDayStart(String(dateFrom)) } : {}),
      ...(dateTo ? { lte: dhakaDayEnd(String(dateTo)) } : {}),
    };
  }

  // Fuzzy Search
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

  // Default Sort if none provided
  const orderBy = prismaQuery.orderBy || { expenseTime: 'desc' as const };

  const data = await prisma.expense.findMany({
    ...prismaQuery,
    where,
    orderBy,
    include: {
      expenseBy: { select: { id: true, name: true } },
    },
  });

  const [meta, byPaid] = await Promise.all([
    queryBuilder.getPaginationMeta(() => prisma.expense.count({ where })),
    // Totals for every matching expense (the page used to add up only the rows it showed)
    prisma.expense.groupBy({ by: ['isPaid'], where, _count: { _all: true }, _sum: { amount: true } }),
  ]);
  // anything not marked paid counts as due (older records may have no isPaid at all)
  const add = (rows: typeof byPaid) => ({
    count: rows.reduce((s, g) => s + g._count._all, 0),
    amount: rows.reduce((s, g) => s + (g._sum.amount ?? 0), 0),
  });
  const paid = add(byPaid.filter((g) => g.isPaid === true));
  const due = add(byPaid.filter((g) => g.isPaid !== true));
  const summary = {
    totalCount: paid.count + due.count,
    totalAmount: paid.amount + due.amount,
    paidCount: paid.count,
    paidAmount: paid.amount,
    dueCount: due.count,
    dueAmount: due.amount,
  };

  return { meta, summary, data };
};

const getExpenseById = async (id: string, ownerId?: string) => {
  const expense = await prisma.expense.findUnique({
    where: { id },
    include: {
      expenseBy: { select: { id: true, name: true } },
    },
  });

  if (!expense || (ownerId && expense.expenseById !== ownerId)) throw new AppError(httpStatus.NOT_FOUND, 'Expense not found');

  return expense;
};

const updateExpenseStatus = async (
  id: string,
  payload: Partial<Pick<Prisma.ExpenseUpdateInput, 'status' | 'isPaid'>>,
  ownerId?: string
) => {
  if (ownerId) {
    const own = await prisma.expense.findFirst({ where: { id, expenseById: ownerId }, select: { id: true } });
    if (!own) throw new AppError(httpStatus.NOT_FOUND, 'Expense not found');
  }
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

// Full edit (admins): fix the amount, title, date, category, etc.
const updateExpense = async (id: string, payload: Record<string, unknown>) => {
  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing) throw new AppError(httpStatus.NOT_FOUND, 'Expense not found');

  const data: Prisma.ExpenseUpdateInput = {};
  if (payload.title !== undefined) {
    const t = String(payload.title).trim();
    if (!t) throw new AppError(httpStatus.BAD_REQUEST, 'Title is required');
    data.title = t;
  }
  if (payload.description !== undefined) data.description = String(payload.description ?? '');
  if (payload.reference !== undefined) data.reference = String(payload.reference ?? '');
  if (payload.method !== undefined) data.method = String(payload.method);
  if (payload.amount !== undefined) {
    const a = Number(payload.amount);
    if (!(a > 0)) throw new AppError(httpStatus.BAD_REQUEST, 'Amount must be greater than 0');
    data.amount = a;
  }
  if (payload.expenseTime !== undefined) {
    const d = new Date(String(payload.expenseTime));
    if (Number.isNaN(d.getTime())) throw new AppError(httpStatus.BAD_REQUEST, 'Invalid expense time');
    data.expenseTime = d;
  }
  if (payload.category !== undefined) data.category = normalizeCategory(payload.category);
  if (payload.status !== undefined) {
    const st = String(payload.status).toUpperCase();
    if (!(Object.values(ExpenseStatus) as string[]).includes(st)) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Invalid status');
    }
    data.status = st as ExpenseStatus;
  }
  if (typeof payload.isPaid === 'boolean') data.isPaid = payload.isPaid;

  return prisma.expense.update({
    where: { id },
    data,
    include: { expenseBy: { select: { id: true, name: true } } },
  });
};

const deleteExpense = async (id: string) => {
  const expense = await prisma.expense.findUnique({ where: { id } });
  if (!expense) throw new AppError(httpStatus.NOT_FOUND, 'Expense not found');

  return await prisma.expense.delete({
    where: { id },
  });
};

const getExpenseAnalytics = async (queryParams: Record<string, unknown>) => {
  const { startDate, endDate } = queryParams as {
    startDate?: string;
    endDate?: string;
  };

  const where: Prisma.ExpenseWhereInput = {};

  if (startDate || endDate) {
    where.expenseTime = {
      ...(startDate ? { gte: dhakaDayStart(String(startDate)) } : {}),
      ...(endDate ? { lte: dhakaDayEnd(String(endDate)) } : {}),
    };
  }

  const [count, sum, byStatus, byCategory] = await Promise.all([
    prisma.expense.count({ where }),
    prisma.expense.aggregate({ where, _sum: { amount: true } }),
    prisma.expense.groupBy({
      by: ['status'],
      _count: { _all: true },
      _sum: { amount: true },
      where,
    }),
    prisma.expense.groupBy({
      by: ['category'],
      _count: { _all: true },
      _sum: { amount: true },
      where: { ...where, status: 'COMPLETED' },
    }),
  ]);

  return {
    totalExpenses: count,
    totalAmount: sum._sum.amount ?? 0,
    byStatus,
    // Completed expenses per category
    byCategory: byCategory.map((c) => ({
      category: c.category ?? UNCATEGORIZED,
      count: c._count._all,
      amount: c._sum.amount ?? 0,
    })),
  };
};

export const ExpenseServices = {
  createExpense,
  getAllExpenses,
  getExpenseById,
  updateExpenseStatus,
  updateExpense,
  deleteExpense,
  getExpenseAnalytics,
};