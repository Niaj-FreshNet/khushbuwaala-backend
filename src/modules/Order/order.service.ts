import { prisma } from '../../../prisma/client';
import AppError from '../../errors/AppError';
import httpStatus from 'http-status';
import { PrismaQueryBuilder } from '../../builder/QueryBuilder';
import { OrderSource, Prisma, SaleType } from '@prisma/client';
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

  if (searchTerm) {
    const s = String(searchTerm);
    where.OR = [
      ...(where.OR || []),
      { invoice: { contains: s, mode: "insensitive" } },
      { name: { contains: s, mode: "insensitive" } },
      { email: { contains: s, mode: "insensitive" } },
      { phone: { contains: s, mode: "insensitive" } },
      { method: { contains: s, mode: "insensitive" } },
    ];
  }

  if (status) where.status = status;

  if (payment === "PAID") where.isPaid = true;
  if (payment === "DUE") where.isPaid = false;

  if (method) where.method = String(method);

  if (dateFrom || dateTo) {
    where.orderTime = {};
    if (dateFrom) where.orderTime.gte = new Date(String(dateFrom));
    if (dateTo) {
      const end = new Date(String(dateTo));
      end.setHours(23, 59, 59, 999);
      where.orderTime.lte = end;
    }
  }

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

const getOrderById = async (idOrInvoice: string) => {
  const param = String(idOrInvoice || "").trim();

  // A MongoDB ObjectId must be exactly 24 hexadecimal characters
  const isMongoId = /^[0-9a-fA-F]{24}$/.test(param);

  const order = await prisma.order.findFirst({
    where: isMongoId
      ? { OR: [{ id: param }, { invoice: param }] }
      : { invoice: param },
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

  if (!order) throw new AppError(httpStatus.NOT_FOUND, 'Order not found');

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
  payToken?: string;
  cartItemIds: string[];
  items?: Array<{ cartItemId?: string; productId?: string; variantId?: string; quantity: number }>;
  amount: number;
  isPaid?: boolean;
  method: string;
  orderSource?: OrderSource;
  saleType?: SaleType;
  shippingCost?: number;
  additionalNotes?: string;
  coupon?: string | null;
  discountAmount?: number;
  customerInfo?: any;
  shippingAddress?: any;
  billingAddress?: any;
}) => {
  const {
    customerId,
    payToken,
    cartItemIds,
    items,
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
  const dbCartItems = await prisma.cartItem.findMany({
    where: { id: { in: cartItemIds }, status: 'IN_CART' },
    include: { product: true, variant: true },
  });

  if (dbCartItems.length === 0) {
    throw new AppError(httpStatus.BAD_REQUEST, 'No valid cart items found.');
  }

  // 2️⃣ Resolve quantities sent by the UI
  const cartItems = dbCartItems.map((ci) => {
    let resolvedQty = ci.quantity;

    if (Array.isArray(items) && items.length > 0) {
      const match =
        items.find((it) => it.cartItemId && String(it.cartItemId) === String(ci.id)) ||
        items.find(
          (it) =>
            it.productId === ci.productId &&
            (!ci.variantId || it.variantId === ci.variantId)
        );

      if (match && Number(match.quantity) > 0) {
        resolvedQty = Math.max(1, Math.floor(Number(match.quantity)));
      }
    }

    return {
      ...ci,
      quantity: resolvedQty,
    };
  });

  const subtotal = cartItems.reduce((sum, ci) => sum + Number(ci.price) * Number(ci.quantity), 0);
  const discount = Math.max(0, Number(discountAmount || 0));
  const shipping = Number(shippingCost || 0);
  const serverAmount = Math.max(0, subtotal - discount) + shipping;

  const normalizeOrGuestEmail = (email?: string | null) => {
    const e = (email ?? "").trim().toLowerCase();
    if (e) return e;
    return `guest+${Date.now()}-${Math.random().toString(16).slice(2)}@khushbuwaala.local`;
  };

  // 3️⃣ SAFE EMAIL CHECK: Prevent `users_email_unique_string` duplicate key errors
  const rawEmail = (customerInfo?.email ?? "").trim().toLowerCase();
  let resolvedCustomerId = customerId || null;

  if (!resolvedCustomerId && rawEmail) {
    const existingUser = await prisma.user.findFirst({
      where: { email: rawEmail },
      select: { id: true },
    });

    if (existingUser) {
      resolvedCustomerId = existingUser.id;
    }
  }

  // 4️⃣ Start transaction
  const order = await prisma.$transaction(
    async (tx) => {
      const invoice = await generateInvoice();

      const newOrder = await tx.order.create({
        data: {
          invoice,
          payToken: payToken || null,
          amount: serverAmount,
          isPaid: isPaid || false,
          method: method || "",
          orderSource: orderSource || 'WEBSITE',
          saleType: saleType || 'SINGLE',
          shippingCost: shipping,
          additionalNotes: additionalNotes || "",
          coupon: coupon ? String(coupon).trim().toUpperCase() : null,
          discountAmount: Number(discountAmount || 0),

          // ✅ Connects existing user ID or creates a unique guest record
          customer: resolvedCustomerId
            ? { connect: { id: resolvedCustomerId } }
            : {
              create: {
                name: customerInfo?.name ?? "",
                phone: customerInfo?.phone ?? "",
                email: normalizeOrGuestEmail(customerInfo?.email),
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

      // Update CartItems to ORDERED and update quantity in DB
      await Promise.all(
        cartItems.map((item) =>
          tx.cartItem.update({
            where: { id: item.id },
            data: {
              orderId: newOrder.id,
              status: 'ORDERED',
              quantity: item.quantity,
              price: Number(item.price),
            },
          })
        )
      );

      // Update stock and create logs using resolved quantity
      for (const item of cartItems) {
        const variantId = item.variantId;
        const productId = item.productId;
        const qty = item.quantity;
        const variantSize = item.variant?.size || 0;

        await tx.product.update({
          where: { id: productId },
          data: {
            salesCount: { increment: qty },
            stock: { decrement: variantSize * qty },
          },
        });

        await tx.stockLog.create({
          data: {
            productId,
            variantId: variantId || '',
            change: -(variantSize * qty),
            reason: 'SALE',
          },
        });
      }

      if (coupon && method === "cashOnDelivery") {
        await DiscountServices.consumeDiscountUsageByCode(tx, coupon, newOrder.id);
      }

      return newOrder;
    },
    {
      timeout: 20000,
    }
  );

  // 5️⃣ Fetch full order
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
  const existing = await prisma.order.findUnique({ where: { id: orderId } });
  if (!existing) throw new AppError(httpStatus.NOT_FOUND, 'Order not found');

  const data: any = {};

  if (payload.status !== undefined) data.status = payload.status;

  if (payload.isPaid !== undefined) {
    if (typeof payload.isPaid !== 'boolean') {
      throw new AppError(httpStatus.BAD_REQUEST, 'isPaid must be boolean');
    }
    data.isPaid = payload.isPaid;
  }
  if (payload.method !== undefined) data.method = payload.method ?? null;

  if (payload.orderSource !== undefined) data.orderSource = payload.orderSource;
  if (payload.saleType !== undefined) data.saleType = payload.saleType;

  if (payload.shippingCost !== undefined) data.shippingCost = cleanNumber(payload.shippingCost, 'shippingCost');
  if (payload.discountAmount !== undefined) data.discountAmount = Math.max(0, Math.floor(Number(payload.discountAmount)));
  if (payload.coupon !== undefined) data.coupon = payload.coupon ? String(payload.coupon).trim().toUpperCase() : null;
  if (payload.additionalNotes !== undefined) data.additionalNotes = payload.additionalNotes ?? null;

  if (payload.shipping !== undefined) data.shipping = payload.shipping;
  if (payload.billing !== undefined) data.billing = payload.billing;

  if (payload.name !== undefined) data.name = payload.name;
  if (payload.phone !== undefined) data.phone = payload.phone;
  if (payload.email !== undefined) data.email = payload.email;
  if (payload.address !== undefined) data.address = payload.address;

  if (payload.amount !== undefined) {
    const amt = cleanNumber(payload.amount, 'amount');
    if (amt! <= 0) throw new AppError(httpStatus.BAD_REQUEST, 'amount must be > 0');
    data.amount = amt;
  }

  if (payload.customerId !== undefined) {
    const role = user?.role;
    if (!['SUPER_ADMIN', 'ADMIN', 'SALESMAN'].includes(role)) {
      throw new AppError(httpStatus.FORBIDDEN, 'Only ADMIN/SUPER_ADMIN/SALESMAN can change customer');
    }

    if (!payload.customerId) {
      data.customerId = null;
    } else {
      data.customer = { connect: { id: payload.customerId } };
    }
  }

  if (payload.salesmanId !== undefined) data.salesman = payload.salesmanId
    ? { connect: { id: payload.salesmanId } }
    : { disconnect: true };

  if (Object.keys(data).length === 0) {
    throw new AppError(httpStatus.BAD_REQUEST, 'No valid fields provided to update');
  }

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

const getMyOrders = async (userId: string, queryParams: Record<string, unknown>) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  // Default limit to 200 so user orders are not truncated at 10
  const normalizedParams = {
    limit: "100",
    ...queryParams,
  };

  const queryBuilder = new PrismaQueryBuilder(normalizedParams);
  const prismaQuery = queryBuilder.buildSort().buildPagination().getQuery();

  const where: Prisma.OrderWhereInput = {
    OR: [
      { customerId: userId },
      ...(user?.email ? [{ email: { equals: user.email, mode: "insensitive" as const } }] : []),
    ],
  };

  const [orders, totalOrders, totalAmount] = await Promise.all([
    prisma.order.findMany({
      ...prismaQuery,
      where,
      orderBy: prismaQuery.orderBy || { createdAt: "desc" },
      select: {
        id: true,
        invoice: true,
        status: true,
        isPaid: true,
        amount: true,
        shippingCost: true,
        orderTime: true,
        createdAt: true,
        orderItems: {
          select: {
            id: true,
            quantity: true,
            price: true,
            product: { select: { id: true, name: true, primaryImage: true } },
            variant: { select: { id: true, size: true, unit: true } },
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

const getAllCustomers = async (queryParams: Record<string, unknown>) => {
  const queryBuilder = new PrismaQueryBuilder(queryParams);
  const prismaQuery = queryBuilder.buildSort().buildPagination().getQuery();

  const customers = await prisma.user.findMany({
    ...prismaQuery,
    where: {
      customerOrders: {
        some: {},
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      contact: true,
      address: true,
      imageUrl: true,
      _count: { select: { customerOrders: true } },
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

const resolveOrderSourceWhere = (type: DashboardType): Prisma.OrderWhereInput => {
  if (type === "website") {
    return { orderSource: OrderSource.WEBSITE };
  }

  if (type === "manual") {
    return {
      orderSource: {
        in: [OrderSource.MANUAL, OrderSource.SHOWROOM, OrderSource.WHOLESALE],
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

const trackOrders = async (queryParam: string) => {
  const param = String(queryParam || "").trim();
  if (!param) throw new AppError(httpStatus.BAD_REQUEST, "Search query is required");

  const cleanDigits = param.replace(/\D/g, "");
  const isMongoId = /^[0-9a-fA-F]{24}$/.test(param);

  // 1️⃣ Build MongoDB raw filter to search root fields AND nested JSON fields (shipping/billing)
  const rawOrConditions: any[] = [
    { invoice: { $regex: param, $options: "i" } },
    { email: { $regex: param, $options: "i" } },
    { "shipping.email": { $regex: param, $options: "i" } },
    { "billing.email": { $regex: param, $options: "i" } },
  ];

  if (isMongoId) {
    rawOrConditions.push({ _id: { $oid: param } });
  }

  // If user searched a phone number (e.g. at least 6 digits)
  if (cleanDigits.length >= 6) {
    rawOrConditions.push(
      { phone: { $regex: cleanDigits, $options: "i" } },
      { "shipping.phone": { $regex: cleanDigits, $options: "i" } },
      { "billing.phone": { $regex: cleanDigits, $options: "i" } }
    );
  }

  // Find matching Order IDs using MongoDB's native JSON traversal
  const matchedOrdersRaw = (await prisma.order.findRaw({
    filter: {
      $or: rawOrConditions,
    },
    options: {
      projection: { _id: 1 },
    },
  })) as unknown as Array<{ _id: { $oid: string } | string }>;

  // Extract the matching 24-char hex ObjectIDs
  const matchedIds = (matchedOrdersRaw || [])
    .map((doc) => (typeof doc._id === "object" ? doc._id.$oid : doc._id))
    .filter(Boolean);

  if (matchedIds.length === 0) {
    return [];
  }

  // 2️⃣ Fetch the full relations (orderItems, products, variants, customer)
  const orders = await prisma.order.findMany({
    where: {
      id: { in: matchedIds },
    },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          imageUrl: true,
        },
      },
      orderItems: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              primaryImage: true,
            },
          },
          variant: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // 3️⃣ Normalize customer details so UI gets consistent fields
  return orders.map((order) => {
    const shippingJson = (order.shipping as any) || {};
    const billingJson = (order.billing as any) || {};
    const customerObj = (order as any).customer || {};

    const resolvedName =
      shippingJson.name ||
      customerObj.name ||
      order.name ||
      "Valued Customer";

    const resolvedPhone =
      shippingJson.phone ||
      customerObj.phone ||
      order.phone ||
      "";

    const resolvedEmail =
      shippingJson.email ||
      customerObj.email ||
      order.email ||
      "";

    const resolvedAddress =
      shippingJson.address ||
      customerObj.address ||
      order.address ||
      "";

    return {
      ...order,
      name: resolvedName,
      phone: resolvedPhone,
      email: resolvedEmail,
      address: resolvedAddress,
      customer: {
        id: customerObj.id || null,
        name: resolvedName,
        phone: resolvedPhone,
        email: resolvedEmail,
        imageUrl: customerObj.imageUrl || null,
      },
    };
  });
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
  trackOrders,
};