import { PrismaQueryBuilder } from '../../builder/QueryBuilder';
import { prisma } from '../../../prisma/client';
import AppError from '../../errors/AppError';
import httpStatus from 'http-status';
import { OrderSource, SaleType } from '@prisma/client';

const getAllOrders = async (queryParams: Record<string, unknown>) => {
  const { searchTerm, status, ...rest } = queryParams;
  const queryBuilder = new PrismaQueryBuilder(rest, ['title', 'content']);
  const prismaQuery = queryBuilder.buildWhere().buildSort().buildPagination().buildSelect().getQuery();
  const where: any = prismaQuery.where || {};

  if (searchTerm) {
    where.OR = [
      ...(where.OR || []),
      {
        customer: {
          name: {
            contains: String(searchTerm),
            mode: 'insensitive',
          },
        },
      },
    ];
  }

  if (status) where.status = status;

  const result = await prisma.order.findMany({
    ...prismaQuery,
    where,
    include: {
      customer: { select: { id: true, name: true, imageUrl: true } },
    },
  });

  const meta = await queryBuilder.getPaginationMeta({
    count: (args: any) =>
      prisma.order.count({ where: { ...args.where, ...where } }),
  });

  return { meta, data: result };
};

const getOrderById = async (orderId: string) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { customer: { select: { id: true, name: true, imageUrl: true } } },
  });
  if (!order) return null;

  const cartItems = order.cartItems as { productId: string; quantity: number }[];
  const productIds = cartItems.map((item) => item.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, primaryImage: true },
  });

  const detailedCartItems = cartItems.map((item) => ({
    ...item,
    product: products.find((p) => p.id === item.productId),
  }));

  return { ...order, cartItems: detailedCartItems };
};

// Create order from cart items
const createOrderWithCartItems = async (payload: {
  customerId?: string;
  amount: number;
  isPaid: boolean;
  orderSource: OrderSource;
  cartItemIds: string[];
  name?: string;
  phone?: string;
  address?: string;
  saleType?: SaleType;
  salesmanId?: string;
}) => {
  const { cartItemIds, customerId, ...orderData } = payload;

  const cartItems = await prisma.cartItem.findMany({
    where: { id: { in: cartItemIds }, status: 'IN_CART' },
  });

  if (!cartItems.length) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Cart items not found');
  }

  const cartItemsJson = cartItems.map((item) => ({
    productId: item.productId,
    variantId: item.variantId,
    quantity: item.quantity,
    price: item.price,
    userId: item.userId ?? null,
  }));

  const order = await prisma.order.create({
    data: {
      customerId,
      ...orderData,
      cartItems: cartItemsJson,
      orderItems: {
        create: cartItems.map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          price: item.price,
          userId: item.userId ?? undefined,
        })),
      },
    },
    include: { orderItems: true },
  });

  await prisma.cartItem.updateMany({
    where: { id: { in: cartItemIds } },
    data: { status: 'ORDERED', orderId: order.id },
  });

  return order;
};

const getUserOrders = async (id: string, queryParams: Record<string, unknown>) => {
  const { searchTerm, ...rest } = queryParams;
  const queryBuilder = new PrismaQueryBuilder(rest);
  const prismaQuery = queryBuilder.buildSort().buildPagination().buildSelect().getQuery();
  const where: any = { customerId: id };

  if (searchTerm && typeof searchTerm === 'string' && searchTerm.trim() !== '') {
    const s = searchTerm.trim();
    const allOrders = await prisma.order.findMany({
      where: { customerId: id },
      include: { customer: { select: { id: true, name: true, imageUrl: true } } },
      orderBy: prismaQuery.orderBy,
    });
    const filteredOrders = allOrders.filter((order) =>
      order.id.toLowerCase().includes(s.toLowerCase()),
    );
    const skip = prismaQuery.skip || 0;
    const take = prismaQuery.take || 10;
    const paginatedOrders = filteredOrders.slice(skip, skip + take);
    const totalOrders = filteredOrders.length;
    const totalAmount = filteredOrders.reduce((sum, order) => sum + order.amount, 0);
    const totalPages = Math.ceil(totalOrders / take);
    const currentPage = Math.floor(skip / take) + 1;

    return { meta: { total: totalOrders, totalPage: totalPages, page: currentPage, limit: take }, totalOrders, totalAmount, data: paginatedOrders };
  }

  const orders = await prisma.order.findMany({ ...prismaQuery, where, include: { customer: { select: { id: true, name: true, imageUrl: true } } } });
  const [totalOrders, totalAmount] = await Promise.all([prisma.order.count({ where }), prisma.order.aggregate({ where, _sum: { amount: true } })]);
  const meta = await queryBuilder.getPaginationMeta({ count: (args: any) => prisma.order.count({ ...args, where }) });

  return { meta, totalOrders, totalAmount: totalAmount._sum.amount ?? 0, data: orders };
};

const updateOrderStatus = async (orderId: string, payload: Record<string, unknown>) => {
  await prisma.order.update({ where: { id: orderId }, data: payload });
  return true;
};

const getMyOrders = async (userId: string, queryParams: Record<string, unknown>) => {
  const queryBuilder = new PrismaQueryBuilder(queryParams, ['id']);
  const prismaQuery = queryBuilder.buildWhere().buildSort().buildPagination().getQuery();
  prismaQuery.where = { ...prismaQuery.where, customerId: userId };
  prismaQuery.include = { customer: { select: { id: true, name: true, imageUrl: true } } };
  const orders = await prisma.order.findMany(prismaQuery);
  const meta = await queryBuilder.getPaginationMeta(prisma.order);
  return { meta, data: orders };
};

const getMyOrder = async (userId: string, orderId: string) => {
  const order = await prisma.order.findUnique({ where: { id: orderId, customerId: userId }, include: { customer: { select: { id: true, name: true, imageUrl: true } } } });
  if (!order) return null;
  const cartItems = order.cartItems as { productId: string; quantity: number }[];
  const productIds = cartItems.map((item) => item.productId);
  const products = await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, primaryImage: true } });
  const detailedCartItems = cartItems.map((item) => ({ ...item, product: products.find((p) => p.id === item.productId) }));
  return { ...order, cartItems: detailedCartItems };
};

const getAllCustomers = async (queryParams: Record<string, unknown>) => {
  const searchableFields = ['name'];
  const queryBuilder = new PrismaQueryBuilder(queryParams, searchableFields).buildWhere().buildSort().buildPagination().buildSelect();
  const prismaQuery = queryBuilder.getQuery();
  prismaQuery.where = { ...prismaQuery.where, role: 'USER', Order: { some: {} } };
  if (!prismaQuery.select) prismaQuery.select = { id: true, name: true, email: true, contact: true, address: true, imageUrl: true, createdAt: true };
  const customers = await prisma.user.findMany(prismaQuery);
  const meta = await queryBuilder.getPaginationMeta(prisma.user);
  return { meta, data: customers };
};

export const OrderServices = {
  getAllOrders,
  getOrderById,
  getUserOrders,
  createOrderWithCartItems,
  updateOrderStatus,
  getMyOrders,
  getMyOrder,
  getAllCustomers,
};
