import { prisma } from '../../../prisma/client';
import AppError from '../../errors/AppError';
import httpStatus from 'http-status';
import { PrismaQueryBuilder } from '../../builder/QueryBuilder';
import { OrderSource, SaleType } from '@prisma/client';// ✅ Get All Orders (with customer + salesman info)
import { generateInvoice } from '../../helpers/generateInvoice';

const getAllOrders = async (queryParams: Record<string, unknown>) => {
  const { searchTerm, status, ...rest } = queryParams;
  const queryBuilder = new PrismaQueryBuilder(rest, ['id', 'customer.name']);
  const prismaQuery = queryBuilder
    .buildWhere()
    .buildSort()
    .buildPagination()
    .getQuery();

  const where: any = prismaQuery.where || {};

  if (searchTerm) {
    where.OR = [
      ...(where.OR || []),
      { name: { contains: String(searchTerm), mode: 'insensitive' } },
      { email: { contains: String(searchTerm), mode: 'insensitive' } },
      { phone: { contains: String(searchTerm), mode: 'insensitive' } },
    ];
  }

  if (status) where.status = status;

  // ✅ Explicitly type the result to include customer
  const orders = await prisma.order.findMany({
    ...prismaQuery,
    where,
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          address: true,
          imageUrl: true,
        },
      },
      orderItems: {
        include: {
          product: { select: { id: true, name: true, primaryImage: true } },
          variant: true,
        },
      },
    },
  });

  const meta = await queryBuilder.getPaginationMeta({
    count: (args: any) => prisma.order.count({ where: args.where }),
  });

  // Normalize customer info for guest orders
  const normalizedOrders = orders.map((order) => {
    const customerData = (order as any).customer ?? {
      id: null,
      name: order.name ?? null,
      phone: order.phone ?? null,
      email: order.email ?? null,
      address: order.address ?? null,
      imageUrl: null,
    };
    return { ...order, customer: customerData };
  });

  return { meta, data: normalizedOrders };
};

// ✅ Get Single Order (with full nested details)
const getOrderById = async (orderId: string) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: { select: { id: true, name: true, imageUrl: true } }, // only valid fields
      orderItems: {
        include: {
          product: { select: { id: true, name: true, primaryImage: true } },
          variant: true,
        },
      },
    },
  });

  if (!order) throw new AppError(httpStatus.NOT_FOUND, 'Order not found');

  // Normalize customer info for guest/manual orders
  const customerData = order.customer || {
    id: null,
    name: order.name || null,
    phone: order.phone || null,
    email: order.email || null,
    address: order.address || null,
    imageUrl: null,
  };

  return { ...order, customer: customerData };
};

// ✅ Create Order with existing CartItems
const createOrderWithCartItems = async (payload: {
  customerId?: string | null;
  payToken?: string, // ✅ add
  cartItemIds: string[];
  amount: number;
  isPaid?: boolean;
  method: string;
  orderSource?: OrderSource;
  saleType?: SaleType;
  shippingCost?: number;
  additionalNotes?: string;
  customerInfo?: {
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
    district?: string;
    thana?: string;
  } | null;
  shippingAddress?: {
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
    district?: string;
    thana?: string;
  };
  billingAddress?: {
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
    district?: string;
    thana?: string;
  };
}) => {
  const {
    customerId,
    payToken,
    cartItemIds,
    amount,
    isPaid,
    method,
    orderSource,
    saleType,
    shippingCost,
    additionalNotes,
    customerInfo,
    shippingAddress,
    billingAddress,
  } = payload;

  // 1️⃣ Fetch valid cart items
  const cartItems = await prisma.cartItem.findMany({
    where: { id: { in: cartItemIds }, status: 'IN_CART' },
    include: { product: true, variant: true },
  });

  if (cartItems.length === 0) {
    throw new AppError(httpStatus.BAD_REQUEST, 'No valid cart items found.');
  }

  // 2️⃣ Start transaction with extended timeout
  const order = await prisma.$transaction(
    async (tx) => {

      const invoice = await generateInvoice();

      // Create Order
      const newOrder = await tx.order.create({
        data: {
          invoice,
          // customerId: customerId || "",
          payToken: payToken || null, // ✅ ADD THIS LINE
          amount: Number(amount),
          isPaid: isPaid || false,
          method: method || "",
          orderSource: orderSource || 'WEBSITE',
          saleType: saleType || 'SINGLE',
          shippingCost: shippingCost || 0,
          additionalNotes: additionalNotes || "",

          // ✅ Correct customer relation handling
          customer: customerId
            ? { connect: { id: customerId } }
            : {
              create: {
                name: customerInfo?.name ?? "",
                phone: customerInfo?.phone ?? "",
                email: customerInfo?.email ?? "",
                address: customerInfo?.address ?? "",
              },
            },

          shipping: {
            name: shippingAddress?.name || customerInfo?.name || null,
            phone: shippingAddress?.phone || customerInfo?.phone || null,
            email: shippingAddress?.email || customerInfo?.email || null,
            address: shippingAddress?.address || customerInfo?.address || null,
            district: shippingAddress?.district || customerInfo?.district || null,
            thana: shippingAddress?.thana || customerInfo?.thana || null,
          },
          billing: {
            name: billingAddress?.name || shippingAddress?.name || customerInfo?.name || null,
            phone: billingAddress?.phone || shippingAddress?.phone || customerInfo?.phone || null,
            email: billingAddress?.email || shippingAddress?.email || customerInfo?.email || null,
            address: billingAddress?.address || shippingAddress?.address || customerInfo?.address || null,
            district: billingAddress?.district || shippingAddress?.district || customerInfo?.district || null,
            thana: billingAddress?.thana || shippingAddress?.thana || customerInfo?.thana || null,
          },
          productIds: cartItems.map((ci) => ci.productId),
          cartItems: cartItems.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            size: item.size || null,
            unit: item.unit || null,
            quantity: item.quantity,
            price: Number(item.price),
          })),
        },
      });

      // Update CartItems as ordered
      await tx.cartItem.updateMany({
        where: { id: { in: cartItems.map((i) => i.id) } },
        data: { orderId: newOrder.id, status: 'ORDERED' },
      });

      // Update stock and create logs
      for (const item of cartItems) {
        const variantId = item.variantId;
        const productId = item.productId;
        const qty = item.quantity;
        const variantSize = item.variant?.size || 0;

        // Update Product stock & salesCount
        await tx.product.update({
          where: { id: productId },
          data: {
            salesCount: { increment: qty },
            stock: { decrement: variantSize * qty },
          },
        });

        // Log stock change
        await tx.stockLog.create({
          data: {
            productId,
            variantId: variantId || '',
            change: -(variantSize * qty),
            reason: 'SALE',
          },
        });
      }

      return newOrder;
    },
    {
      timeout: 20000, // ✅ 20 seconds instead of default 5s
    }
  );

  // 3️⃣ Fetch full order
  const fullOrder = await prisma.order.findUnique({
    where: { id: order.id },
    include: {
      customer: { select: { id: true, name: true, imageUrl: true } },
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

const updateOrderStatus = async (orderId: string, payload: Record<string, unknown>) => {
  const order = await prisma.order.update({
    where: { id: orderId },
    data: payload,
  });
  return order;
};

const getUserOrders = async (userId: string, queryParams: Record<string, unknown>) => {
  const queryBuilder = new PrismaQueryBuilder(queryParams);
  const prismaQuery = queryBuilder.buildSort().buildPagination().getQuery();

  const where = { customerId: userId };

  const [orders, totalOrders, totalAmount] = await Promise.all([
    prisma.order.findMany({
      ...prismaQuery,
      where,
      include: {
        orderItems: {
          include: {
            product: { select: { id: true, name: true, primaryImage: true } },
            variant: true,
          },
        },
      },
    }),
    prisma.order.count({ where }),
    prisma.order.aggregate({ where, _sum: { amount: true } }),
  ]);

  const meta = await queryBuilder.getPaginationMeta({
    count: (args: any) => prisma.order.count({ where: args.where }),
  });

  return {
    meta,
    totalOrders,
    totalAmount: totalAmount._sum.amount ?? 0,
    data: orders,
  };
};

// ✅ Get all orders for a specific user
const getMyOrders = async (userId: string, queryParams: Record<string, unknown>) => {
  const queryBuilder = new PrismaQueryBuilder(queryParams);
  const prismaQuery = queryBuilder.buildSort().buildPagination().getQuery();

  const where = { customerId: userId };

  const [orders, totalOrders, totalAmount] = await Promise.all([
    prisma.order.findMany({
      ...prismaQuery,
      where,
      include: {
        orderItems: {
          include: {
            product: { select: { id: true, name: true, primaryImage: true } },
            variant: true,
          },
        },
      },
    }),
    prisma.order.count({ where }),
    prisma.order.aggregate({ where, _sum: { amount: true } }),
  ]);

  const meta = await queryBuilder.getPaginationMeta({
    count: (args: any) => prisma.order.count({ where: args.where }),
  });

  return {
    meta,
    totalOrders,
    totalAmount: totalAmount._sum.amount ?? 0,
    data: orders,
  };
};

// ✅ Get a single order belonging to logged-in user
const getMyOrder = async (userId: string, orderId: string) => {
  const order = await prisma.order.findFirst({
    where: { id: orderId, customerId: userId },
    include: {
      orderItems: {
        include: {
          product: { select: { id: true, name: true, primaryImage: true } },
          variant: true,
        },
      },
    },
  });

  if (!order) throw new AppError(httpStatus.NOT_FOUND, 'Order not found');
  return order;
};

// ✅ Get all customers who have orders (for admin)
const getAllCustomers = async (queryParams: Record<string, unknown>) => {
  const queryBuilder = new PrismaQueryBuilder(queryParams);
  const prismaQuery = queryBuilder.buildSort().buildPagination().getQuery();

  const customers = await prisma.user.findMany({
    ...prismaQuery,
    where: {
      customerOrders: { // ✅ Use correct relation name from Prisma
        some: {}, // fetch users who have at least one order as a customer
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      contact: true,
      address: true,
      imageUrl: true,
      _count: { select: { customerOrders: true } }, // ✅ same here
    },
  });

  const meta = await queryBuilder.getPaginationMeta({
    count: (args: any) =>
      prisma.user.count({
        where: {
          customerOrders: { some: {} },
        },
      }),
  });

  return { meta, data: customers };
};

// const getMyOrders = async (userId: string, queryParams: Record<string, unknown>) => {
//   const queryBuilder = new PrismaQueryBuilder(queryParams, ['id']);
//   const prismaQuery = queryBuilder.buildWhere().buildSort().buildPagination().getQuery();
//   prismaQuery.where = { ...prismaQuery.where, customerId: userId };
//   prismaQuery.include = { customer: { select: { id: true, name: true, imageUrl: true } } };
//   const orders = await prisma.order.findMany(prismaQuery);
//   const meta = await queryBuilder.getPaginationMeta(prisma.order);
//   return { meta, data: orders };
// };

// const getMyOrder = async (userId: string, orderId: string) => {
//   const order = await prisma.order.findUnique({ where: { id: orderId, customerId: userId }, include: { customer: { select: { id: true, name: true, imageUrl: true } } } });
//   if (!order) return null;
//   const cartItems = order.cartItems as { productId: string; quantity: number }[];
//   const productIds = cartItems.map((item) => item.productId);
//   const products = await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, primaryImage: true } });
//   const detailedCartItems = cartItems.map((item) => ({ ...item, product: products.find((p) => p.id === item.productId) }));
//   return { ...order, cartItems: detailedCartItems };
// };

// const getAllCustomers = async (queryParams: Record<string, unknown>) => {
//   const searchableFields = ['name'];
//   const queryBuilder = new PrismaQueryBuilder(queryParams, searchableFields).buildWhere().buildSort().buildPagination().buildSelect();
//   const prismaQuery = queryBuilder.getQuery();
//   prismaQuery.where = { ...prismaQuery.where, role: 'USER', Order: { some: {} } };
//   if (!prismaQuery.select) prismaQuery.select = { id: true, name: true, email: true, contact: true, address: true, imageUrl: true, createdAt: true };
//   const customers = await prisma.user.findMany(prismaQuery);
//   const meta = await queryBuilder.getPaginationMeta(prisma.user);
//   return { meta, data: customers };
// };

export const OrderServices = {
  getAllOrders,
  getOrderById,
  createOrderWithCartItems,
  updateOrderStatus,
  getUserOrders,
  getMyOrders,
  getMyOrder,
  getAllCustomers
};
