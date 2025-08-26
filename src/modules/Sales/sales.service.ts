// src/app/modules/sales/sales.service.ts
import { PrismaQueryBuilder } from '../../builder/QueryBuilder';
import { prisma } from '../../../prisma/client';
import {
  OrderSource,
  OrderStatus,
  Prisma,
  SaleType,
} from '@prisma/client';

// Treat “sales” as orders with a non-WEBSITE orderSource
const MANUAL_SOURCES: OrderSource[] = [
  OrderSource.SHOWROOM,
  OrderSource.WHOLESALE,
  OrderSource.MANUAL,
];

// -------------------------------
// Create a manual sale (Order)
// -------------------------------
const createSale = async (
  payload: {
    cartItems: Array<{
      productId: string;
      variantId?: string | null;
      quantity: number;
      price: number;
    }>;
    amount: number;
    isPaid: boolean;
    name?: string;
    phone?: string;
    address?: string;
    status?: OrderStatus; // default PROCESSING
    orderSource?: OrderSource; // default MANUAL
    saleType?: SaleType; // default SINGLE
  },
  salesmanId: string
) => {
  const {
    cartItems,
    amount,
    isPaid,
    name,
    phone,
    address,
    status = OrderStatus.PROCESSING,
    orderSource = OrderSource.MANUAL,
    saleType = SaleType.SINGLE,
  } = payload;

  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    throw new Error('Cart items are required');
  }
  if (amount <= 0) {
    throw new Error('Amount must be greater than 0');
  }

  // Persist productIds for quick lookups/analytics
  const productIds = cartItems.map((ci) => ci.productId);

  const created = await prisma.order.create({
    data: {
      amount,
      isPaid,
      cartItems: cartItems, // JSON
      status,
      orderSource,
      saleType,
      salesmanId,
      name: name ?? null,
      phone: phone ?? null,
      address: address ?? null,
      productIds,
    },
    include: {
      salesman: { select: { id: true, name: true, imageUrl: true, email: true } },
    },
  });

  return created;
};

// -------------------------------
// Admin: get all manual sales
// -------------------------------
const getAllSales = async (queryParams: Record<string, unknown>) => {
  const { searchTerm, status, source, ...rest } = queryParams as {
    searchTerm?: string;
    status?: OrderStatus | string;
    source?: OrderSource | string;
  };

  const queryBuilder = new PrismaQueryBuilder(rest);
  const prismaQuery = queryBuilder
    .buildWhere()
    .buildSort()
    .buildPagination()
    .getQuery();

  const where: Prisma.OrderWhereInput = {
    ...prismaQuery.where,
    // restrict to manual sources unless explicitly overridden with ?source=WEBSITE
    ...(source
      ? { orderSource: source as OrderSource }
      : { orderSource: { in: MANUAL_SOURCES } }),
  };

  if (status) where.status = status as OrderStatus;

  if (searchTerm && searchTerm.trim()) {
    const s = searchTerm.trim();
    where.OR = [
      { name: { contains: s, mode: 'insensitive' } },
      { phone: { contains: s, mode: 'insensitive' } },
      { address: { contains: s, mode: 'insensitive' } },
      {
        salesman: {
          OR: [
            { name: { contains: s, mode: 'insensitive' } },
            { email: { contains: s, mode: 'insensitive' } },
          ],
        },
      },
    ];
  }

  const data = await prisma.order.findMany({
    ...prismaQuery,
    where,
    include: {
      salesman: { select: { id: true, name: true, imageUrl: true, email: true } },
    },
  });

  const meta = await queryBuilder.getPaginationMeta({
    count: (args: any) =>
      prisma.order.count({ where: { ...where, ...(args?.where ?? {}) } }),
  });

  return { meta, data };
};

// -------------------------------
// Salesman: my sales
// -------------------------------
const getMySales = async (salesmanId: string, queryParams: Record<string, unknown>) => {
  const { searchTerm, status, source, ...rest } = queryParams as {
    searchTerm?: string;
    status?: OrderStatus | string;
    source?: OrderSource | string;
  };

  const queryBuilder = new PrismaQueryBuilder(rest);
  const prismaQuery = queryBuilder
    .buildWhere()
    .buildSort()
    .buildPagination()
    .getQuery();

  const where: Prisma.OrderWhereInput = {
    ...prismaQuery.where,
    salesmanId,
    ...(source
      ? { orderSource: source as OrderSource }
      : { orderSource: { in: MANUAL_SOURCES } }),
  };

  if (status) where.status = status as OrderStatus;

  if (searchTerm && searchTerm.trim()) {
    const s = searchTerm.trim();
    where.OR = [
      { name: { contains: s, mode: 'insensitive' } },
      { phone: { contains: s, mode: 'insensitive' } },
      { address: { contains: s, mode: 'insensitive' } },
    ];
  }

  const data = await prisma.order.findMany({
    ...prismaQuery,
    where,
    include: {
      salesman: { select: { id: true, name: true, imageUrl: true, email: true } },
    },
  });

  const [count, sum] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.aggregate({ where, _sum: { amount: true } }),
  ]);

  const meta = await queryBuilder.getPaginationMeta({
    count: (args: any) => prisma.order.count({ where: { ...where, ...(args?.where ?? {}) } }),
  });

  return {
    meta,
    totalSales: count,
    totalAmount: sum._sum.amount ?? 0,
    data,
  };
};

// -------------------------------
// Admin: sales by customer phone
// -------------------------------
const getSalesByCustomer = async (phone: string, queryParams: Record<string, unknown>) => {
  const queryBuilder = new PrismaQueryBuilder(queryParams);
  const prismaQuery = queryBuilder.buildSort().buildPagination().getQuery();

  const where: Prisma.OrderWhereInput = {
    phone: { contains: phone, mode: 'insensitive' },
    orderSource: { in: MANUAL_SOURCES },
  };

  const data = await prisma.order.findMany({
    ...prismaQuery,
    where,
    include: {
      salesman: { select: { id: true, name: true, imageUrl: true, email: true } },
    },
  });

  const meta = await queryBuilder.getPaginationMeta({
    count: (args: any) => prisma.order.count({ where: { ...where, ...(args?.where ?? {}) } }),
  });

  return { meta, data };
};

// -------------------------------
/** Update sale status / payment */
const updateSaleStatus = async (
  id: string,
  payload: Partial<Pick<Prisma.OrderUpdateInput, 'status' | 'isPaid'>>
) => {
  // Only allow valid enum if provided
  const data: Prisma.OrderUpdateInput = {};
  if (payload.status) data.status = payload.status as OrderStatus;
  if (typeof payload.isPaid === 'boolean') data.isPaid = payload.isPaid;

  const updated = await prisma.order.update({
    where: { id },
    data,
    include: {
      salesman: { select: { id: true, name: true, imageUrl: true, email: true } },
    },
  });

  return updated;
};

// -------------------------------
// Admin: sales analytics
// -------------------------------
const getSalesAnalytics = async (queryParams: Record<string, unknown>) => {
  const { startDate, endDate, salesmanId } = queryParams as {
    startDate?: string;
    endDate?: string;
    salesmanId?: string;
  };

  const where: Prisma.OrderWhereInput = {
    orderSource: { in: MANUAL_SOURCES },
  };

  if (salesmanId) where.salesmanId = salesmanId;
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) (where.createdAt as any).gte = new Date(startDate);
    if (endDate) (where.createdAt as any).lte = new Date(endDate);
  }

  const [count, sum, byStatus, bySource] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.aggregate({ where, _sum: { amount: true } }),
    prisma.order.groupBy({
      by: ['status'],
      _count: { _all: true },
      _sum: { amount: true },
      where,
    }),
    prisma.order.groupBy({
      by: ['orderSource'],
      _count: { _all: true },
      _sum: { amount: true },
      where,
    }),
  ]);

  return {
    totalSales: count,
    totalAmount: sum._sum.amount ?? 0,
    byStatus,
    bySource,
  };
};

// (Optional) Single sale fetch if you still need it anywhere
const getSaleById = async (id: string) => {
  const sale = await prisma.order.findUnique({
    where: { id },
    include: {
      salesman: { select: { id: true, name: true, imageUrl: true, email: true } },
    },
  });
  return sale;
};

export const SaleServices = {
  // creation
  createSale,
  // lists
  getAllSales,
  getMySales,
  getSalesByCustomer,
  // update
  updateSaleStatus,
  // analytics
  getSalesAnalytics,
  // optional
  getSaleById,
};
