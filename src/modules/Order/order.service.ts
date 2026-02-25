import { prisma } from '../../../prisma/client';
import AppError from '../../errors/AppError';
import httpStatus from 'http-status';
import { PrismaQueryBuilder } from '../../builder/QueryBuilder';
import { OrderSource, Prisma, SaleType } from '@prisma/client';// ✅ Get All Orders (with customer + salesman info)
import { generateInvoice } from '../../helpers/generateInvoice';
import { DiscountServices } from '../Discount/discount.service';
import { DashboardType, UpdateOrderPayload } from './order.interface';
import { subDays, startOfDay, endOfDay, startOfMonth, format } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

const getAllOrders = async (queryParams: Record<string, unknown>) => {
  const { searchTerm, status, payment, method, dateFrom, dateTo, productId, ...rest } = queryParams;

  const queryBuilder = new PrismaQueryBuilder(rest, ['id', 'customer.name']);
  const prismaQuery = queryBuilder
    .buildWhere()
    .buildSort()
    .buildPagination()
    .getQuery();

  const where: any = prismaQuery.where || {};

  // ✅ global search (you will expand this to invoice, district, etc)
  if (searchTerm) {
    const s = String(searchTerm);
    where.OR = [
      ...(where.OR || []),
      { invoice: { contains: s, mode: "insensitive" } },
      { name: { contains: s, mode: "insensitive" } },
      { email: { contains: s, mode: "insensitive" } },
      { phone: { contains: s, mode: "insensitive" } },
      { method: { contains: s, mode: "insensitive" } },
      // shipping/billing are Json -> cannot "contains" in Prisma reliably unless you store searchable fields separately
    ];
  }

  if (status) where.status = status;

  // ✅ payment filter
  if (payment === "PAID") where.isPaid = true;
  if (payment === "DUE") where.isPaid = false;

  // ✅ method filter
  if (method) where.method = String(method);

  // ✅ date range filter
  if (dateFrom || dateTo) {
    where.orderTime = {};
    if (dateFrom) where.orderTime.gte = new Date(String(dateFrom));
    if (dateTo) {
      // include the full day
      const end = new Date(String(dateTo));
      end.setHours(23, 59, 59, 999);
      where.orderTime.lte = end;
    }
  }

  // ✅ product filter (this is the new one)
  if (productId) {
    where.productIds = { has: String(productId) };
  }

  const orders = await prisma.order.findMany({
    ...prismaQuery,
    where,
    include: {
      customer: {
        select: { id: true, name: true, email: true, phone: true, address: true, imageUrl: true },
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
  coupon?: string | null;
  discountAmount?: number;
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
    coupon,
    discountAmount,
  } = payload;

  // 1️⃣ Fetch valid cart items
  const cartItems = await prisma.cartItem.findMany({
    where: { id: { in: cartItemIds }, status: 'IN_CART' },
    include: { product: true, variant: true },
  });

  if (cartItems.length === 0) {
    throw new AppError(httpStatus.BAD_REQUEST, 'No valid cart items found.');
  }

  const subtotal = cartItems.reduce((sum, ci) => sum + Number(ci.price) * Number(ci.quantity), 0);

  const discount = Math.max(0, Number(discountAmount || 0));
  const shipping = Number(shippingCost || 0);

  // final server truth
  const serverAmount = Math.max(0, subtotal - discount) + shipping;

  const normalizeOrGuestEmail = (email?: string | null) => {
    const e = (email ?? "").trim().toLowerCase();
    if (e) return e;

    // unique enough for your use case
    return `guest+${Date.now()}-${Math.random().toString(16).slice(2)}@khushbuwaala.local`;
  };

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
          // amount: Number(amount),
          amount: serverAmount,
          isPaid: isPaid || false,
          method: method || "",
          orderSource: orderSource || 'WEBSITE',
          saleType: saleType || 'SINGLE',
          // shippingCost: shippingCost || 0,
          shippingCost: shipping,
          additionalNotes: additionalNotes || "",
          // coupon: coupon ? String(coupon).trim().toUpperCase() : null,  
          coupon: coupon ? String(coupon).trim().toUpperCase() : null,
          discountAmount: Number(discountAmount || 0),


          // ✅ Correct customer relation handling
          customer: customerId
            ? { connect: { id: customerId } }
            : {
              create: {
                name: customerInfo?.name ?? "",
                phone: customerInfo?.phone ?? "",
                email: normalizeOrGuestEmail(customerInfo?.email), // ✅ changed line
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

      // ✅ consume coupon usage ONLY if COD (successful order placement)
      if (coupon && method === "cashOnDelivery") {
        await DiscountServices.consumeDiscountUsageByCode(tx, coupon, newOrder.id);
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

const updatePaymentStatus = async (orderId: string, payload: Record<string, unknown>) => {
  const isPaid = payload?.isPaid;

  if (typeof isPaid !== 'boolean') {
    throw new AppError(httpStatus.BAD_REQUEST, 'isPaid must be boolean');
  }

  const order = await prisma.order.update({
    where: { id: orderId },
    data: { isPaid },
  });

  return order;
};

const cleanNumber = (v: any, field: string) => {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new AppError(httpStatus.BAD_REQUEST, `${field} must be a number`);
  return n;
};

const updateOrder = async (orderId: string, payload: UpdateOrderPayload, user: any) => {
  // 1) ensure order exists
  const existing = await prisma.order.findUnique({ where: { id: orderId } });
  if (!existing) throw new AppError(httpStatus.NOT_FOUND, 'Order not found');

  // 2) build a SAFE update object (whitelist)
  const data: any = {};

  // status
  if (payload.status !== undefined) data.status = payload.status;

  // payment
  if (payload.isPaid !== undefined) {
    if (typeof payload.isPaid !== 'boolean') {
      throw new AppError(httpStatus.BAD_REQUEST, 'isPaid must be boolean');
    }
    data.isPaid = payload.isPaid;
  }
  if (payload.method !== undefined) data.method = payload.method ?? null;

  // source/saleType
  if (payload.orderSource !== undefined) data.orderSource = payload.orderSource;
  if (payload.saleType !== undefined) data.saleType = payload.saleType;

  // shippingCost / discount / coupon / notes
  if (payload.shippingCost !== undefined) data.shippingCost = cleanNumber(payload.shippingCost, 'shippingCost');
  if (payload.discountAmount !== undefined) data.discountAmount = Math.max(0, Math.floor(Number(payload.discountAmount)));
  if (payload.coupon !== undefined) data.coupon = payload.coupon ? String(payload.coupon).trim().toUpperCase() : null;
  if (payload.additionalNotes !== undefined) data.additionalNotes = payload.additionalNotes ?? null;

  // shipping/billing JSON (replace fully)
  if (payload.shipping !== undefined) data.shipping = payload.shipping;
  if (payload.billing !== undefined) data.billing = payload.billing;

  // walk-in fields (optional)
  if (payload.name !== undefined) data.name = payload.name;
  if (payload.phone !== undefined) data.phone = payload.phone;
  if (payload.email !== undefined) data.email = payload.email;
  if (payload.address !== undefined) data.address = payload.address;

  // amount override (optional)
  if (payload.amount !== undefined) {
    const amt = cleanNumber(payload.amount, 'amount');
    if (amt! <= 0) throw new AppError(httpStatus.BAD_REQUEST, 'amount must be > 0');
    data.amount = amt;
  }

  // optionally: change customerId (be careful)
  // only allow SUPER_ADMIN / ADMIN to do this
  if (payload.customerId !== undefined) {
    const role = user?.role;
    if (!['SUPER_ADMIN', 'ADMIN', 'SALESMAN'].includes(role)) {
      throw new AppError(httpStatus.FORBIDDEN, 'Only ADMIN/SUPER_ADMIN/SALESMAN can change customer');
    }

    if (!payload.customerId) {
      data.customerId = null;
    } else {
      // connect via relation
      data.customer = { connect: { id: payload.customerId } };
      // also clear walk-in fields if you want:
      // data.name = null; data.phone = null; data.email = null; data.address = null;
    }
  }

  // manual sales
  if (payload.salesmanId !== undefined) data.salesman = payload.salesmanId
    ? { connect: { id: payload.salesmanId } }
    : { disconnect: true };

  // 3) must have at least one update
  if (Object.keys(data).length === 0) {
    throw new AppError(httpStatus.BAD_REQUEST, 'No valid fields provided to update');
  }

  // 4) update
  const updated = await prisma.order.update({
    where: { id: orderId },
    data,
    include: {
      customer: { select: { id: true, name: true, imageUrl: true, email: true, phone: true, address: true } },
      orderItems: {
        include: {
          product: { select: { id: true, name: true, primaryImage: true } },
          variant: true,
        },
      },
    },
  });

  // normalize customer for guest/manual
  const customerData = updated.customer || {
    id: null,
    name: updated.name || null,
    phone: updated.phone || null,
    email: updated.email || null,
    address: updated.address || null,
    imageUrl: null,
  };

  return { ...updated, customer: customerData };
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

const resolveOrderSourceWhere = (type: DashboardType): Prisma.OrderWhereInput => {
  if (type === "website") {
    return { orderSource: OrderSource.WEBSITE };
  }

  if (type === "manual") {
    return {
      orderSource: {
        in: [OrderSource.MANUAL, OrderSource.SHOWROOM, OrderSource.WHOLESALE], // ✅ mutable array
      },
    };
  }

  return {};
};

const buildLast7Days = () => {
  const days: { key: string; label: string; date: Date }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = subDays(new Date(), i);
    const label = d.toLocaleDateString("en-US", { weekday: "short" });
    const key = d.toISOString().slice(0, 10);
    days.push({ key, label, date: d });
  }
  return days;
};

const TZ = "Asia/Dhaka";

const getDashboardMetrics = async (type: DashboardType = "all") => {
  const nowUtc = new Date();
  const nowDhaka = toZonedTime(nowUtc, TZ);

  const todayStartDhaka = startOfDay(nowDhaka);
  const todayEndDhaka = endOfDay(nowDhaka);
  const monthStartDhaka = startOfMonth(nowDhaka);

  // Convert Dhaka boundaries -> UTC dates for DB filter
  const todayStart = fromZonedTime(todayStartDhaka, TZ);
  const todayEnd = fromZonedTime(todayEndDhaka, TZ);
  const monthStart = fromZonedTime(monthStartDhaka, TZ);

  const sourceWhere = resolveOrderSourceWhere(type);

  const baseOrdersWhere: Prisma.OrderWhereInput = {
    ...sourceWhere,
    status: { not: "CANCELED" },
  };

  const baseSalesWhere: Prisma.OrderWhereInput = {
    ...sourceWhere,
    status: { not: "CANCELED" },
    isPaid: true,
  };

  const [todayOrders, monthOrders, monthSalesAgg, totalSalesAgg] = await Promise.all([
    prisma.order.count({
      where: { ...baseOrdersWhere, orderTime: { gte: todayStart, lte: todayEnd } },
    }),
    prisma.order.count({
      where: { ...baseOrdersWhere, orderTime: { gte: monthStart } },
    }),
    prisma.order.aggregate({
      where: { ...baseSalesWhere, orderTime: { gte: monthStart } },
      _sum: { amount: true },
    }),
    prisma.order.aggregate({
      where: baseSalesWhere,
      _sum: { amount: true },
    }),
  ]);

  return {
    type,
    todayOrders,
    monthOrders,
    monthSales: Number(monthSalesAgg._sum.amount ?? 0),
    totalSales: Number(totalSalesAgg._sum.amount ?? 0),
  };
};

const getWeeklySalesOverview = async (type: DashboardType = "all") => {
  const last7 = buildLast7Days();

  const fromDhakaStart = startOfDay(last7[0].date);
  const fromUtc = fromZonedTime(fromDhakaStart, TZ);

  const sourceWhere = resolveOrderSourceWhere(type);

  const orders = await prisma.order.findMany({
    where: {
      ...sourceWhere,
      orderTime: { gte: fromUtc },
      status: { not: "CANCELED" },
    },
    select: {
      orderTime: true,
      amount: true,
      isPaid: true,
    },
  });

  const buckets: Record<string, { sales: number; orders: number }> = {};
  for (const d of last7) buckets[d.key] = { sales: 0, orders: 0 };

  for (const o of orders) {
    const oDhaka = toZonedTime(o.orderTime, TZ);
    const key = format(oDhaka, "yyyy-MM-dd");
    if (!buckets[key]) continue;

    buckets[key].orders += 1;
    if (o.isPaid) buckets[key].sales += Number(o.amount ?? 0);
  }

  return last7.map((d) => ({
    day: d.label,
    sales: buckets[d.key]?.sales ?? 0,
    orders: buckets[d.key]?.orders ?? 0,
  }));
};

export const OrderServices = {
  getAllOrders,
  getOrderById,
  createOrderWithCartItems,
  updateOrderStatus,
  updatePaymentStatus,
  updateOrder,
  getUserOrders,
  getMyOrders,
  getMyOrder,
  getAllCustomers,
  getDashboardMetrics,
  getWeeklySalesOverview,
};
