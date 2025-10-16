// src/app/modules/sales/sales.service.ts
import { PrismaQueryBuilder } from '../../builder/QueryBuilder';
import { prisma } from '../../../prisma/client';
import {
  OrderSource,
  OrderStatus,
  Prisma,
  SaleType,
} from '@prisma/client';
import httpStatus from 'http-status';
import AppError from '../../errors/AppError';

// Treat “sales” as orders with a non-WEBSITE orderSource
const MANUAL_SOURCES: OrderSource[] = [
  OrderSource.SHOWROOM,
  OrderSource.WHOLESALE,
  OrderSource.MANUAL,
];

// -------------------------------
// Create a manual sale (Order)
// -------------------------------

const createSale = async (payload: {
  customerId?: string | null;
  salesmanId?: string | null;        // ✅ new optional field for manual sales
  saleType?: SaleType;               // ✅ optional sale type
  cartItemIds: string[];
  amount: number;
  isPaid?: boolean;
  orderSource?: OrderSource;
  customerInfo?: {
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
  } | null;
}) => {
  const { customerId, salesmanId, saleType, cartItemIds, amount, isPaid, orderSource, customerInfo } = payload;

  // 1️⃣ Fetch valid cart items
  const cartItems = await prisma.cartItem.findMany({
    where: { id: { in: cartItemIds }, status: 'IN_CART' },
    include: { product: true, variant: true },
  });

  if (cartItems.length === 0) {
    throw new AppError(httpStatus.BAD_REQUEST, 'No valid cart items found.');
  }

  // 2️⃣ Start transaction
  const order = await prisma.$transaction(async (tx) => {
    // Create Order
    const newOrder = await tx.order.create({
      data: {
        customerId: customerId || null,
        salesmanId: salesmanId || null,       // ✅ assign salesman for manual sales
        saleType: saleType || SaleType.SINGLE, // default SINGLE
        amount,
        isPaid: isPaid || false,
        orderSource: orderSource || OrderSource.WEBSITE, // WEBSITE by default
        name: customerInfo?.name || null,
        phone: customerInfo?.phone || null,
        email: customerInfo?.email || null,
        address: customerInfo?.address || null,
        cartItems: cartItems.map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          price: item.price,
        })),
        productIds: cartItems.map((ci) => ci.productId), // ✅ persist product IDs
      },
    });

    // Update CartItems as ordered
    await Promise.all(
      cartItems.map((item) =>
        tx.cartItem.update({
          where: { id: item.id },
          data: { orderId: newOrder.id, status: 'ORDERED' },
        })
      )
    );

    // Update stock, salesCount, stock logs
    await Promise.all(
      cartItems.map(async (item) => {
        const variantId = item.variantId;
        const productId = item.productId;
        const qty = item.quantity;
        const variantSize = item.variant?.size || 0;

        // Product variant stock update if exists
        if (variantId) {
          await tx.productVariant.update({
            where: { id: variantId },
            data: {}, // optional: add variant stock management
          });
        }

        // Product stock & sales count
        await tx.product.update({
          where: { id: productId },
          data: {
            salesCount: { increment: qty },
            stock: { decrement: variantSize * qty },
          },
        });

        // Stock log
        await tx.stockLog.create({
          data: {
            productId,
            variantId: variantId || '',
            change: -(variantSize * qty),
            reason: 'SALE',
          },
        });
      })
    );

    return newOrder;
  });

  // 3️⃣ Fetch full order
  const fullOrder = await prisma.order.findUnique({
    where: { id: order.id },
    include: {
      customer: { select: { id: true, name: true, imageUrl: true } },
      salesman: { select: { id: true, name: true, imageUrl: true } },
      orderItems: {
        include: {
          product: { select: { id: true, name: true, primaryImage: true } },
          variant: true,
        },
      },
    },
  });

  if (!fullOrder) throw new AppError(httpStatus.NOT_FOUND, 'Order not found');

  const customerData = fullOrder.customer || {
    id: null,
    name: fullOrder.name || null,
    phone: fullOrder.phone || null,
    email: fullOrder.email || null,
    address: fullOrder.address || null,
    imageUrl: null,
  };

  return { ...fullOrder, customer: customerData };
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
