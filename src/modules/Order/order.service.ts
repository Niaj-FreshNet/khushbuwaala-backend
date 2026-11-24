import { prisma } from '../../../prisma/client';
import AppError from '../../errors/AppError';
import { dhakaDayEnd, dhakaDayStart } from '../../utils/dhakaTime';
import httpStatus from 'http-status';
import { PrismaQueryBuilder } from '../../builder/QueryBuilder';
import { OrderSource, OrderStatus, Prisma, SaleType, type OrderItemCost } from '@prisma/client';
import { syncStockForStatusChange, returnStockBeforeDelete, rebalanceStockForItemEdit, cancelAbandonedCheckout } from '../../utils/orderStock';
import { priceWebsiteOrder } from './orderPricing';
import { generateInvoice } from '../../helpers/generateInvoice';
import { DiscountServices } from '../Discount/discount.service';
import { DashboardType, UpdateOrderPayload } from './order.interface';
import { subDays, startOfDay, endOfDay, startOfMonth, format, startOfWeek, endOfWeek, subMonths } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { sendOrderConfirmationEmail, sendOrderNotificationToAdmin } from '../../helpers/emailSender/emails';
import { calculateOrderFinancials, FinanceServices, snapshotOrderCosts } from '../Finance/finance.service';
import { parseOrderStatus, parseReturnCharge } from '../../utils/returnCharge';
import { isEnumValue } from '../../utils/enumValue';
import type { AuthUser } from '../../types';
import { asAddress, type AddressJson, type OrderRow } from '../../types/records';
import { errorMessage } from '../../utils/errorInfo';
import { buildMetaPurchasePayload, type CapiOrder } from '../../utils/metaPurchase';

const orderListInclude = {
  customer: {
    select: { id: true, name: true, email: true, phone: true, address: true, imageUrl: true },
  },
  orderItems: {
    include: {
      product: { select: { id: true, name: true, primaryImage: true } },
      variant: true,
    },
  },
} satisfies Prisma.OrderInclude;

/** The customer to show: the linked account, else the name/phone typed on the order */
const customerOf = (order: { customer?: object | null; name?: string | null; phone?: string | null; email?: string | null; address?: string | null }) =>
  order.customer ?? {
    id: null,
    name: order.name ?? null,
    phone: order.phone ?? null,
    email: order.email ?? null,
    address: order.address ?? null,
    imageUrl: null,
  };

const getAllOrders = async (queryParams: Record<string, unknown>, user?: AuthUser | null) => {
  const { searchTerm, status, payment, method, dateFrom, dateTo, productId, ...rest } = queryParams;

  const queryBuilder = new PrismaQueryBuilder(rest, ['id', 'customer.name']);
  const prismaQuery = queryBuilder
    .buildWhere()
    .buildSort()
    .buildPagination()
    .getQuery();

  const where: Prisma.OrderWhereInput = { ...prismaQuery.where };

  if (searchTerm) {
    const s = String(searchTerm);
    const orList = Array.isArray(where.OR) ? where.OR : [];
    where.OR = [
      ...orList,
      { invoice: { contains: s, mode: "insensitive" } },
      { name: { contains: s, mode: "insensitive" } },
      { email: { contains: s, mode: "insensitive" } },
      { phone: { contains: s, mode: "insensitive" } },
      { method: { contains: s, mode: "insensitive" } },
    ];
  }

  // an unknown status used to reach Prisma and fail the whole list
  if (isEnumValue(OrderStatus, status)) where.status = status;
  if (payment === "PAID") where.isPaid = true;
  if (payment === "DUE") where.isPaid = false;
  if (method) where.method = String(method);

  if (dateFrom || dateTo) {
    // Bangladesh calendar days (the server runs in UTC; this used to be 06:00–06:00 Dhaka)
    where.orderTime = {
      ...(dateFrom ? { gte: dhakaDayStart(String(dateFrom)) } : {}),
      ...(dateTo ? { lte: dhakaDayEnd(String(dateTo)) } : {}),
    };
  }

  if (productId) {
    where.productIds = { has: String(productId) };
  }

  // 🔒 Cost and profit only for the Super Admin
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  // 1️⃣ Fetch paginated orders and unpaginated filtered dataset for summary simultaneously
  const [orders, allFilteredOrders, meta] = await Promise.all([
    prisma.order.findMany({
      ...prismaQuery,
      where,
      include: orderListInclude,
    }),
    prisma.order.findMany({
      where,
      include: { orderItems: true },
    }),
    queryBuilder.getPaginationMeta(() => prisma.order.count({ where })),
  ]);

  // Cost snapshots are read separately (Prisma's MongoDB relation filter is unreliable for them)
  const costsByOrder = new Map<string, OrderItemCost[]>();
  if (isSuperAdmin && orders.length > 0) {
    const allItemCosts = await prisma.orderItemCost.findMany({
      where: { orderId: { in: orders.map((o) => o.id) } },
    });
    for (const c of allItemCosts) costsByOrder.set(c.orderId, [...(costsByOrder.get(c.orderId) ?? []), c]);
  }

  const totalCount = allFilteredOrders.length;
  let totalValidCount = 0;
  let totalCodAmount = 0;
  let totalBillAmount = 0;
  let totalRcvAmount = 0;
  let paidCount = 0;
  let dueCount = 0;

  allFilteredOrders.forEach((order) => {
    const financials = FinanceServices.calculateOrderFinancials(order); // ✅ Using Finance Logic
    if (!financials.isCanceledOrReturned) {
      totalValidCount += Number(financials.isValidOrderCount);
      totalCodAmount += Number(order.amount);
      totalBillAmount += Number(financials.productBill);
      if (financials.isPaid) paidCount++;
      else dueCount++;
    }
    totalRcvAmount += Number(financials.netReceivable);
  });

  const summary = { totalCount, totalValidCount, totalCodAmount, totalBillAmount, totalRcvAmount, paidCount, dueCount };

  // Profit per order: the same rule as Finance and the sales list (courier returns = collected − fee).
  // Orders used an older rule (cancelled 0, returned −estimated fee) and could disagree with Finance.
  const normalizedOrders = orders.map((order) => ({
    ...order,
    customer: customerOf(order),
    orderItemCosts: isSuperAdmin ? FinanceServices.resolveOrderItemCosts({ ...order, orderItemCosts: costsByOrder.get(order.id) ?? [] }) : [],
  }));

  return { meta, summary, data: normalizedOrders };
};


const getOrderById = async (idOrInvoice: string, user?: AuthUser | null) => {
  const param = String(idOrInvoice || "").trim();
  const isMongoId = /^[0-9a-fA-F]{24}$/.test(param);

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

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

  // Invoice numbers are short and guessable, so looking up by invoice is limited to staff and
  // the customer who owns the order. The 24-character order id (used in invoice links) stays open.
  const isStaff = ['SUPER_ADMIN', 'ADMIN', 'SALESMAN'].includes(String(user?.role));
  const lookedUpById = isMongoId && order.id === param;
  if (!lookedUpById && !isStaff && (!user?.id || order.customerId !== user.id)) {
    throw new AppError(httpStatus.NOT_FOUND, 'Order not found');
  }

  // Profit lines (Super Admin): the same rule as Finance and the lists
  const itemCosts = isSuperAdmin ? await prisma.orderItemCost.findMany({ where: { orderId: order.id } }) : [];
  const orderItemCosts = isSuperAdmin ? FinanceServices.resolveOrderItemCosts({ ...order, orderItemCosts: itemCosts }) : undefined;

  return { ...order, customer: customerOf(order), ...(orderItemCosts ? { orderItemCosts } : {}) };
};

// ✅ Create Order with existing CartItems
const createOrderWithCartItems = async (payload: {
  customerId?: string | null;
  payToken?: string;
  cartItemIds: string[];
  items?: Array<{
    cartItemId?: string;
    productId?: string;
    variantId?: string;
    quantity: number;
    price?: number;
    originalPrice?: number;
  }>;
  amount: number;
  isPaid?: boolean;
  method: string;
  orderSource?: OrderSource;
  saleType?: SaleType;
  shippingCost?: number;
  additionalNotes?: string;
  coupon?: string | null;
  discountAmount?: number;
  fbp?: string | null;
  fbc?: string | null;
  customerInfo?: AddressJson;
  shippingAddress?: AddressJson;
  billingAddress?: AddressJson;
}) => {
  const {
    customerId,
    payToken,
    cartItemIds,
    items,
    amount,
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

  const rawEmail = (customerInfo?.email ?? "").trim().toLowerCase();

  // 1️⃣ Cart items for this checkout
  const dbCartItems = await prisma.cartItem.findMany({
      where: {
        // `in: undefined` would drop the filter and match every customer's cart
        id: { in: Array.isArray(cartItemIds) ? cartItemIds : [] },
        OR: [
          { status: 'IN_CART' },
          {
            status: 'ORDERED',
            order: {
              isPaid: false,
              method: { not: 'cashOnDelivery' }, // Never recycle or touch legitimate COD orders
            },
          },
        ],
      },
      include: {
        product: true,
        variant: true,
        order: { select: { id: true, isPaid: true, method: true } },
      },
    });

  if (dbCartItems.length === 0) {
    throw new AppError(httpStatus.BAD_REQUEST, 'No valid cart items found.');
  }

  // 2️⃣ Resolve quantities and prices strictly from frontend payload with DB fallback
  const cartItems = items && items.length > 0 ? items.map((it) => {
    const dbItem = dbCartItems.find((ci) => String(ci.id) === String(it.cartItemId) || ci.productId === it.productId);

    const resolvedQty = Math.max(1, Math.floor(Number(it.quantity || dbItem?.quantity || 1)));
    const resolvedPrice = Number(it.price ?? dbItem?.price ?? 0);
    const resolvedOriginalPrice = Number(it.originalPrice ?? dbItem?.originalPrice ?? resolvedPrice);
    const unitDiscount = Math.max(0, resolvedOriginalPrice - resolvedPrice);

    return {
      id: dbItem?.id || it.cartItemId || "",
      productId: String(it.productId || dbItem?.productId || ""),
      variantId: it.variantId || dbItem?.variantId || null,
      size: dbItem?.size || dbItem?.variant?.size || null,
      unit: dbItem?.unit || dbItem?.variant?.unit || null,
      quantity: resolvedQty,
      price: resolvedPrice,
      originalPrice: resolvedOriginalPrice,
      discount: unitDiscount,
      product: dbItem?.product,
      variant: dbItem?.variant,
    };
  }) : dbCartItems.map((ci) => ({
    id: ci.id,
    productId: ci.productId,
    variantId: ci.variantId,
    size: ci.size || ci.variant?.size || null,
    unit: ci.unit || ci.variant?.unit || null,
    quantity: ci.quantity,
    price: Number(ci.price),
    originalPrice: Number(ci.originalPrice ?? ci.price),
    discount: Math.max(0, Number(ci.originalPrice ?? ci.price) - Number(ci.price)),
    product: ci.product,
    variant: ci.variant,
  }));

  // 2b) WEBSITE orders: the server decides every price (the browser's prices, delivery and
  // totals were trusted before, so a crafted request could buy at any price).
  const isWebsite = (orderSource || 'WEBSITE') === 'WEBSITE';
  const pricing = isWebsite
    ? await priceWebsiteOrder(
        cartItems.map((ci) => ({ productId: ci.productId, variantId: ci.variantId, size: ci.size, unit: ci.unit, quantity: ci.quantity })),
        coupon,
        shippingAddress?.district || customerInfo?.district
      )
    : null;
  if (pricing) {
    pricing.lines.forEach((l, i) => {
      Object.assign(cartItems[i], {
        productId: l.productId,
        variantId: l.variantId,
        size: l.size,
        unit: l.unit,
        variant: l.variant,
        quantity: l.quantity,
        price: l.unitPrice,
        originalPrice: l.listPrice,
        discount: Math.max(0, l.listPrice - l.unitPrice),
      });
    });
    if (Math.abs(Number(amount || 0) - pricing.total) > 1) {
      console.warn(`[pricing] website order total differs: browser ${amount} vs server ${pricing.total} (coupon ${coupon || '-'})`);
    }
  }

  const subtotal = cartItems.reduce((sum, ci) => sum + Number(ci.price) * Number(ci.quantity), 0);
  // Order-level discount only (item sale prices are already in each line price)
  const discount = pricing ? pricing.couponDiscount : Math.max(0, Number(discountAmount || 0));
  const shipping = pricing ? pricing.shipping : Number(shippingCost || 0);
  const serverAmount = pricing ? pricing.total : Math.max(0, subtotal) + shipping;

  const normalizeOrGuestEmail = (email?: string | null) => {
    const e = (email ?? "").trim().toLowerCase();
    if (e) return e;
    return `guest+${Date.now()}-${Math.random().toString(16).slice(2)}@khushbuwaala.local`;
  };

  // 3️⃣ SAFE EMAIL CHECK
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

  // 3️⃣ Database Transaction (Batch queries with Promise.all)
  const order = await prisma.$transaction(
    async (tx) => {
      // 🔄 ONLY revert items from aborted ONLINE checkout attempts
      const failedOnlineOrderIds = [
        ...new Set(
          dbCartItems
            .filter((ci) => ci.order && !ci.order.isPaid && ci.order.method !== 'cashOnDelivery')
            .map((ci) => ci.order!.id)
        ),
      ];

      // One at a time, each guarded: a double-clicked retry can't put the same stock back twice
      // (the cart was read before this transaction, so it may already be out of date).
      for (const failedId of failedOnlineOrderIds) {
        await cancelAbandonedCheckout(tx, failedId as string);
      }

      const invoice = await generateInvoice();

      // Ensure productIds array contains only valid strings
      const safeProductIds = cartItems.map((ci) => ci.productId).filter(Boolean) as string[];

      // Create Order:
      // - If method === 'cashOnDelivery', isPaid remains false, status is PENDING / PROCESSING
      // - If method === 'online', isPaid remains false until gateway callback marks COMPLETED
      const newOrder = await tx.order.create({
        data: {
          invoice,
          payToken: payToken || null,
          amount: serverAmount,
          isPaid: false,
          method: method || "",
          orderSource: orderSource || 'WEBSITE',
          saleType: saleType || 'SINGLE',
          shippingCost: shipping,
          additionalNotes: additionalNotes || "",
          coupon: coupon && (!pricing || pricing.couponApplied) ? String(coupon).trim().toUpperCase() : null,
          discountAmount: Math.round(discount),

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
            fbp: payload.fbp || null, // ✅ Store fbp
            fbc: payload.fbc || null, // ✅ Store fbc
          },
          billing: {
            name: billingAddress?.name || shippingAddress?.name || customerInfo?.name || null,
            phone: billingAddress?.phone || shippingAddress?.phone || customerInfo?.phone || null,
            email: billingAddress?.email || shippingAddress?.email || customerInfo?.email || null,
            address: billingAddress?.address || shippingAddress?.address || customerInfo?.address || null,
            district: billingAddress?.district || shippingAddress?.district || customerInfo?.district || null,
            thana: billingAddress?.thana || shippingAddress?.thana || customerInfo?.thana || null,
          },
          productIds: safeProductIds,
          cartItems: cartItems.map((item) => ({
            productId: item.productId,
            variantId: item.variantId || undefined,
            size: item.size || null,
            unit: item.unit || null,
            quantity: item.quantity,
            price: Number(item.price),
          })),
        },
      });

      // Update CartItems to ORDERED
      await Promise.all(
        cartItems.map((item) =>
          tx.cartItem.update({
            where: { id: item.id },
            data: {
              orderId: newOrder.id,
              status: 'ORDERED',
              quantity: item.quantity,
              price: Number(item.price),
              originalPrice: Number(item.originalPrice),
              discount: Number(item.discount),
            },
          })
        )
      );

      // Decrement product inventory and create stock logs concurrently in parallel
      await Promise.all([
        ...cartItems.map((item) => {
          const variantSize = item.variant?.size || 0;
          const qty = item.quantity;
          return tx.product.update({
            where: { id: item.productId },
            data: {
              salesCount: { increment: qty },
              stock: { decrement: variantSize * qty },
            },
          });
        }),
        ...cartItems.map((item) => {
          const variantSize = item.variant?.size || 0;
          const qty = item.quantity;
          return tx.stockLog.create({
            data: {
              productId: item.productId,
              variantId: item.variantId || null,
              change: -(variantSize * qty),
              reason: 'SALE',
            },
          });
        }),
      ]);

      // If Cash on Delivery, consume coupon immediately
      if (coupon && method === "cashOnDelivery") {
        await DiscountServices.consumeDiscountUsageByCode(tx, coupon, newOrder.id);
      }

      return newOrder;
    },
    { timeout: 15000 }
  );

  // 5️⃣ Fetch populated order for frontend response and background processing
  const fullOrder = await prisma.order.findUnique({
    where: { id: order.id },
    include: {
      customer: { select: { id: true, name: true, email: true, imageUrl: true } },
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

  const finalOrder = { ...fullOrder, customer: customerData };

  // 🚀 BACKGROUND TASKS (Non-blocking: emails and CAPI fire after response is sent)
  setImmediate(() => {
    const ship = asAddress(finalOrder.shipping);
    const bill = asAddress(finalOrder.billing);
    const cust: { email?: string | null; phone?: string | null } = finalOrder.customer ?? {};
    const customerEmail = ship.email || bill.email || cust.email || finalOrder.email || undefined;

    const customerPhone = ship.phone || bill.phone || cust.phone || finalOrder.phone || undefined;

    // ✅ 1. Dispatch emails & CAPI ONLY for Cash on Delivery immediately. 
    // Online payments (bKash/DGePay) will trigger CAPI and emails on successful payment callback/webhook verification.
    if (finalOrder.method === 'cashOnDelivery') {
      dispatchOrderEmails(finalOrder).catch((err) =>
        console.error('❌ Failed to dispatch order emails:', err)
      );
      sendMetaCapiPurchase(finalOrder, customerEmail, customerPhone);

      snapshotOrderCosts(finalOrder.id).catch((err) =>
        console.error('❌ Failed to snapshot order costs:', err)
      );
    }
  });

  // ✅ Return full order so frontend & Redux store populate the Thank You page correctly
  return finalOrder;
};

const updateOrderStatus = async (orderId: string, payload: Record<string, unknown>) => {
  // Only the status may change here (this used to write the whole request body into the order).
  const status = parseOrderStatus(payload?.status);
  // courier return: what the customer still paid the rider (D-025)
  const returnCharge = parseReturnCharge(payload, status);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.order.findUnique({ where: { id: orderId } });
    if (!existing) throw new AppError(httpStatus.NOT_FOUND, 'Order not found');
    await syncStockForStatusChange(tx, existing, status);
    return tx.order.update({
      where: { id: orderId },
      data: { status: status as OrderStatus, ...(returnCharge !== undefined && { returnChargeCollected: returnCharge }) },
    });
  }, { maxWait: 10000, timeout: 15000 });
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

const cleanNumber = (v: unknown, field: string) => {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new AppError(httpStatus.BAD_REQUEST, `${field} must be a number`);
  return n;
};

const updateOrder = async (orderId: string, payload: UpdateOrderPayload, user: AuthUser | null | undefined) => {
  const existing = await prisma.order.findUnique({
    where: { id: orderId },
    include: { orderItems: true },
  });
  if (!existing) throw new AppError(httpStatus.NOT_FOUND, 'Order not found');

  const updated = await prisma.$transaction(
    async (tx) => {
      const data: Prisma.OrderUpdateInput = {};

      if (payload.status !== undefined) {
        // a real status only (a typo used to reach the database and fail with a 500)
        data.status = parseOrderStatus(payload.status);
        await syncStockForStatusChange(tx, existing, data.status);
      }

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
        if (!['SUPER_ADMIN', 'ADMIN', 'SALESMAN'].includes(String(role))) {
          throw new AppError(httpStatus.FORBIDDEN, 'Only ADMIN/SUPER_ADMIN/SALESMAN can change customer');
        }

        if (!payload.customerId) {
          data.customer = { disconnect: true };
        } else {
          data.customer = { connect: { id: payload.customerId } };
        }
      }

      if (payload.salesmanId !== undefined) data.salesman = payload.salesmanId
        ? { connect: { id: payload.salesmanId } }
        : { disconnect: true };

      // 🔄 HANDLE ORDER ITEMS UPDATE IF PROVIDED IN PAYLOAD
      if (payload.orderItems && Array.isArray(payload.orderItems)) {
        // Stock follows the edit: only the net change per product is applied.
        await rebalanceStockForItemEdit(tx, orderId, async () => {
        const incomingItems = payload.orderItems!; // checked above
        const existingItems = existing.orderItems; // fetched with include: { orderItems: true }

        const incomingItemIds = incomingItems
          .map((item) => item.id)
          .filter((id): id is string => !!id && !id.startsWith("temp_"));

        // 1. Identify items to delete (exist in DB but missing from incoming payload)
        const itemsToDelete = existingItems.filter((item) => !incomingItemIds.includes(item.id));

        if (itemsToDelete.length > 0) {
          await tx.cartItem.deleteMany({
            where: { id: { in: itemsToDelete.map((i) => i.id) } },
          });
        }

        // 2. Process incoming items (Update existing real IDs, Create new temp/missing ones)
        const safeProductIds: string[] = [];

        await Promise.all(
          incomingItems.map(async (item) => {
            if (item.productId) safeProductIds.push(item.productId);

            const itemPayload = {
              productId: item.productId,
              // a real id or none (a placeholder like "default_variant" made the save fail)
              variantId: item.variantId && /^[a-f0-9]{24}$/i.test(item.variantId) ? item.variantId : null,
              size: Number(item.size || 0),
              unit: item.unit || "ML",
              quantity: Math.max(1, Number(item.quantity || 1)),
              price: Number(item.price || 0),
              status: "ORDERED" as const,
            };

            // If it's an existing real DB item ID, update it
            if (item.id && !item.id.toString().startsWith("temp_")) {
              // Ensure the item actually belongs to this order before updating
              const belongsToOrder = existingItems.some((ei) => ei.id === item.id);
              if (belongsToOrder) {
                return tx.cartItem.update({
                  where: { id: item.id },
                  data: itemPayload,
                });
              }
            }

            // Otherwise, create a new cart item linked to this order
            if (!itemPayload.productId) throw new AppError(httpStatus.BAD_REQUEST, 'Each added item needs a product');
            return tx.cartItem.create({
              data: {
                ...itemPayload,
                productId: itemPayload.productId,
                orderId: existing.id,
              },
            });
          })
        );

        data.productIds = [...new Set(safeProductIds)];
        });
      }

      if (Object.keys(data).length === 0) {
        throw new AppError(httpStatus.BAD_REQUEST, 'No valid fields provided to update');
      }

      return await tx.order.update({
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
    },
    { timeout: 15000 }
  );

  // Finance reads the frozen cost snapshot: rebuild it when items or money changed (sales already
  // did this; website-order edits left Finance on the old items, e.g. #857211 on 2026-11-23).
  const moneyKeys = ['orderItems', 'amount', 'discountAmount', 'shippingCost', 'status'] as const;
  const moneyChanged = moneyKeys.some((k) => payload[k] !== undefined);
  if (moneyChanged && !['CANCELED', 'RETURNED'].includes(String(updated.status))) {
    await snapshotOrderCosts(updated.id).catch((err) => console.error('❌ Failed to refresh order cost snapshot:', err));
  }

  // A Steadfast "collected ≠ order total" note is settled once the edited total matches (D-026)
  if (updated.courierReview && /^Steadfast collected .* but the order total is/.test(updated.courierReview)
    && updated.courierCodCollected != null && Math.abs(Number(updated.amount) - Number(updated.courierCodCollected)) < 1) {
    await prisma.order.update({ where: { id: updated.id }, data: { courierReview: null } });
    updated.courierReview = null;
  }

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

  const meta = await queryBuilder.getPaginationMeta(() => prisma.order.count({ where }));

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

  const meta = await queryBuilder.getPaginationMeta(() => prisma.order.count({ where }));

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
      phone: true, // User has no contact field (asking for it made this endpoint fail every time)
      address: true,
      imageUrl: true,
      _count: { select: { customerOrders: true } },
    },
  });

  const meta = await queryBuilder.getPaginationMeta(() =>
    prisma.user.count({
        where: {
          customerOrders: { some: {} },
        },
      }),
  );

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

const TZ = "Asia/Dhaka";
// "2026-11-30" -> "30-11-26". Buckets are keyed yyyy-MM-dd so they sort by date; sorting the old
// dd-MM-yy keys put "01-12-26" before "29-11-26" whenever a range crossed into a new month.
const toDisplayDay = (isoDay: string) => `${isoDay.slice(8, 10)}-${isoDay.slice(5, 7)}-${isoDay.slice(2, 4)}`;

const getDashboardMetrics = async (type: DashboardType = "all") => {
  const nowUtc = new Date();
  const nowDhaka = toZonedTime(nowUtc, TZ);

  const todayStartDhaka = startOfDay(nowDhaka);
  const todayEndDhaka = endOfDay(nowDhaka);

  const weekStartDhaka = startOfWeek(nowDhaka, { weekStartsOn: 6 }); // Saturday start
  const weekEndDhaka = endOfWeek(nowDhaka, { weekStartsOn: 6 });

  const monthStartDhaka = startOfMonth(nowDhaka);
  const threeMonthsAgoDhaka = startOfMonth(subMonths(nowDhaka, 2)); // Current month + past 2 months

  const todayStart = fromZonedTime(todayStartDhaka, TZ);
  const todayEnd = fromZonedTime(todayEndDhaka, TZ);
  const weekStart = fromZonedTime(weekStartDhaka, TZ);
  const weekEnd = fromZonedTime(weekEndDhaka, TZ);
  const monthStart = fromZonedTime(monthStartDhaka, TZ);
  const threeMonthsStart = fromZonedTime(threeMonthsAgoDhaka, TZ);

  const sourceWhere = resolveOrderSourceWhere(type);

  // Fetch all orders from the last 3 months onwards to process timeframes cleanly in memory
  const orders = await prisma.order.findMany({
    where: {
      ...sourceWhere,
      orderTime: { gte: threeMonthsStart },
    },
    include: { orderItems: true },
  });

  let todayOrders = 0, todaySales = 0;
  let weekOrders = 0, weekSales = 0;
  let monthOrders = 0, monthSales = 0;
  let last3MonthsOrders = 0, last3MonthsSales = 0;

  orders.forEach((order) => {
    const orderTime = new Date(order.orderTime);
    const financials = calculateOrderFinancials(order); // Uses your centralized robust logic (excludes canceled/returned)

    // Strict rule: Only count valid non-canceled/non-returned orders
    if (!financials.isCanceledOrReturned) {
      const bill = financials.productBill;

      // Today
      if (orderTime >= todayStart && orderTime <= todayEnd) {
        todayOrders++;
        todaySales += bill;
      }

      // This Week
      if (orderTime >= weekStart && orderTime <= weekEnd) {
        weekOrders++;
        weekSales += bill;
      }

      // This Month
      if (orderTime >= monthStart) {
        monthOrders++;
        monthSales += bill;
      }

      // Last 3 Months
      if (orderTime >= threeMonthsStart) {
        last3MonthsOrders++;
        last3MonthsSales += bill;
      }
    }
  });

  return {
    type,
    today: { orders: todayOrders, sales: todaySales },
    thisWeek: { orders: weekOrders, sales: weekSales },
    thisMonth: { orders: monthOrders, sales: monthSales },
    last3Months: { orders: last3MonthsOrders, sales: last3MonthsSales },
  };
};

const getWeeklySalesOverview = async (type: DashboardType = "all") => {

  // Start of the day 6 days ago in DHAKA (the server clock is UTC; between 00:00 and 06:00
  // Dhaka the UTC date is still yesterday, which used to add an extra day).
  const fromDhakaStart = startOfDay(subDays(toZonedTime(new Date(), TZ), 6));
  const fromUtc = fromZonedTime(fromDhakaStart, TZ);

  const sourceWhere = resolveOrderSourceWhere(type);

  const orders = await prisma.order.findMany({
    where: {
      ...sourceWhere,
      orderTime: { gte: fromUtc },
    },
    include: {
      orderItems: {
        include: {
          product: { select: { id: true, name: true, primaryImage: true } },
          variant: true,
        },
      },
    },
    orderBy: { orderTime: "asc" },
  });

  const dailyBuckets: Record<string, { sales: number; netReceivable: number; ordersCount: number; ordersList: (typeof orders)[number][] }> = {};

  for (const o of orders) {
    const oDhaka = toZonedTime(o.orderTime, TZ);
    const key = format(oDhaka, "yyyy-MM-dd"); // sortable; shown as dd-MM-yy below

    if (!dailyBuckets[key]) {
      dailyBuckets[key] = { sales: 0, netReceivable: 0, ordersCount: 0, ordersList: [] };
    }

    const financials = calculateOrderFinancials(o);

    // Only count valid orders (excluding canceled/returned) for period orders count
    dailyBuckets[key].ordersCount += financials.isValidOrderCount;
    dailyBuckets[key].ordersList.push(o);

    // Period revenue = total bill without canceled/returned
    dailyBuckets[key].sales += financials.productBill;
    dailyBuckets[key].netReceivable += financials.netReceivable;
  }

  return Object.keys(dailyBuckets)
    .sort()
    .map((dateKey) => ({
      date: toDisplayDay(dateKey),
      totalSales: dailyBuckets[dateKey].sales,           // Total Bill (Excl. Canceled/Returned)
      totalNetReceivable: dailyBuckets[dateKey].netReceivable, // Delivered/Completed Paid + Returned losses
      totalOrders: dailyBuckets[dateKey].ordersCount,     // Orders excl. Canceled/Returned
      orders: dailyBuckets[dateKey].ordersList,
    }));
};

const getMonthlySalesOverview = async (type: DashboardType = "all", year?: number, month?: number) => {
  const nowUtc = new Date();
  const nowDhaka = toZonedTime(nowUtc, TZ);

  const targetYear = year ? Number(year) : nowDhaka.getFullYear();
  const targetMonth = month ? Number(month) - 1 : nowDhaka.getMonth();

  const monthStartDhaka = new Date(targetYear, targetMonth, 1, 0, 0, 0, 0);
  const monthEndDhaka = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);

  const monthStart = fromZonedTime(monthStartDhaka, TZ);
  const monthEnd = fromZonedTime(monthEndDhaka, TZ);

  const sourceWhere = resolveOrderSourceWhere(type);

  const orders = await prisma.order.findMany({
    where: {
      ...sourceWhere,
      orderTime: { gte: monthStart, lte: monthEnd },
    },
    include: {
      orderItems: {
        include: {
          product: { select: { id: true, name: true, primaryImage: true } },
          variant: true,
        },
      },
    },
    orderBy: { orderTime: "asc" },
  });

  const dailyBuckets: Record<string, { sales: number; netReceivable: number; ordersCount: number; ordersList: (typeof orders)[number][] }> = {};

  for (const o of orders) {
    const oDhaka = toZonedTime(o.orderTime, TZ);
    const key = format(oDhaka, "yyyy-MM-dd"); // sortable; shown as dd-MM-yy below

    if (!dailyBuckets[key]) {
      dailyBuckets[key] = { sales: 0, netReceivable: 0, ordersCount: 0, ordersList: [] };
    }

    const financials = calculateOrderFinancials(o);

    // Only count valid orders (excluding canceled/returned) for period orders count
    dailyBuckets[key].ordersCount += financials.isValidOrderCount;
    dailyBuckets[key].ordersList.push(o);

    // Period revenue = total bill without canceled/returned
    dailyBuckets[key].sales += financials.productBill;
    dailyBuckets[key].netReceivable += financials.netReceivable;
  }

  return Object.keys(dailyBuckets)
    .sort()
    .map((dateKey) => ({
      date: toDisplayDay(dateKey),
      totalSales: dailyBuckets[dateKey].sales,           // Total Bill (Excl. Canceled/Returned)
      totalNetReceivable: dailyBuckets[dateKey].netReceivable, // Delivered/Completed Paid + Returned losses
      totalOrders: dailyBuckets[dateKey].ordersCount,     // Orders excl. Canceled/Returned
      orders: dailyBuckets[dateKey].ordersList,
    }));
};

/** Last 10 digits of a phone number, whatever the formatting (+880, spaces, dashes). */
const phoneKey = (value: unknown): string => String(value ?? "").replace(/\D/g, "").slice(-10);

/**
 * Public order tracking. Anyone can see how far an order has got from its invoice number, but
 * the name, phone and address are sent only when the caller also gives the phone number used
 * on that order (owner decision 2026-11-25: invoice numbers are short and can be guessed).
 */
const trackOrders = async (queryParam: string, verifyPhone?: string) => {
  const param = String(queryParam || "").trim();
  if (!param) throw new AppError(httpStatus.BAD_REQUEST, "Search query is required");

  const cleanDigits = param.replace(/\D/g, "");
  const isMongoId = /^[0-9a-fA-F]{24}$/.test(param);

  // 1️⃣ Exact matches only. The visitor's text is never used as a pattern (".*" used to return
  // every order with customer details). Email is matched whole, ignoring capital letters.
  const escapeRegex = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const exactEmail = { $regex: `^${escapeRegex(param)}$`, $options: "i" };
  const rawOrConditions: Prisma.InputJsonObject[] = [
    { invoice: param },
    ...(param.includes("@")
      ? [{ email: exactEmail }, { "shipping.email": exactEmail }, { "billing.email": exactEmail }]
      : []),
  ];

  if (isMongoId) {
    rawOrConditions.push({ _id: { $oid: param } });
  }

  // Phone: the whole number must match (its last 10 digits, whatever the formatting:
  // +880, spaces, dashes). Built only from digits, so it can't be abused as a pattern.
  if (cleanDigits.length >= 10 && !param.includes("@")) {
    const last10 = cleanDigits.slice(-10);
    const phonePattern = { $regex: `${last10.split("").join("\\D*")}$` };
    rawOrConditions.push(
      { phone: phonePattern },
      { "shipping.phone": phonePattern },
      { "billing.phone": phonePattern }
    );
  }

  // Find matching Order IDs using MongoDB's native JSON traversal
  const matchedOrdersRaw = (await prisma.order.findRaw({
    filter: {
      $or: rawOrConditions,
    },
    options: {
      projection: { _id: 1 },
      limit: 20,
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
          // Never the whole variant: it carries the cost price, and this route is public.
          variant: { select: { id: true, size: true, unit: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // 3️⃣ Normalize customer details so UI gets consistent fields
  return orders.map((order, index) => {
    const shippingJson = asAddress(order.shipping);
    const customerObj: { id?: string | null; name?: string | null; phone?: string | null; email?: string | null; address?: string | null; imageUrl?: string | null } = order.customer || {};

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

    // This route needs no sign-in, so staff-only fields stay behind: the payment token (it
    // lets its holder start a payment for the order) and courier settlement details.
    const {
      payToken: _payToken, salesmanId: _salesmanId, courierPayoutId: _courierPayoutId,
      courierPaidAt: _courierPaidAt, courierCodCollected: _courierCodCollected,
      courierReview: _courierReview, courierSyncedAt: _courierSyncedAt, stockReturned: _stockReturned,
      returnChargeCollected: _returnChargeCollected, deliveryCharge: _deliveryCharge,
      ...publicOrder
    } = order;
    void [_payToken, _salesmanId, _courierPayoutId, _courierPaidAt, _courierCodCollected, _courierReview,
      _courierSyncedAt, _stockReturned, _returnChargeCollected, _deliveryCharge];

    const givenPhone = phoneKey(verifyPhone);
    const billingJson = asAddress(order.billing);
    // Both halves are needed: the order was found by its own number (not by a phone or email),
    // and the phone given belongs to it.
    const foundByOwnNumber = order.invoice === param || order.id === param;
    const phoneMatches =
      foundByOwnNumber &&
      givenPhone.length === 10 &&
      [resolvedPhone, order.phone, shippingJson.phone, billingJson.phone, customerObj.phone].some(
        (p) => phoneKey(p) === givenPhone
      );

    if (!phoneMatches) {
      const tail = phoneKey(resolvedPhone).slice(-3);
      return {
        ...publicOrder,
        // Found by a phone or email: the invoice number stays hidden too, otherwise knowing
        // someone's phone number would be enough to unlock their address.
        ...(foundByOwnNumber
          ? {}
          : { id: `order-${index + 1}`, invoice: `••••${String(order.invoice ?? "").slice(-2)}`, coupon: null }),
        needsInvoice: !foundByOwnNumber,
        customerId: null,
        additionalNotes: null,
        name: null,
        phone: tail ? `•••••••${tail}` : null,
        email: null,
        address: null,
        // the district stays: the page explains the delivery charge with it
        shipping: shippingJson.district ? { district: shippingJson.district } : null,
        billing: null,
        customer: null,
        detailsHidden: true,
      };
    }

    return {
      ...publicOrder,
      detailsHidden: false,
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

const deleteOrder = async (orderId: string) => {
  const existing = await prisma.order.findUnique({
    where: { id: orderId },
  });

  if (!existing) {
    throw new AppError(httpStatus.NOT_FOUND, 'Order not found');
  }

  const result = await prisma.$transaction(async (tx) => {
    // 0️⃣ Put stock back if this order still holds it
    await returnStockBeforeDelete(tx, existing);

    // Child rows that require the order (otherwise the delete is rejected)
    await tx.orderItemCost.deleteMany({ where: { orderId } });
    await tx.orderDiscount.deleteMany({ where: { orderId } });
    await tx.orderExtraCost.deleteMany({ where: { orderId } });

    // 1️⃣ Delete associated cart items tied to this order
    await tx.cartItem.deleteMany({
      where: { orderId },
    });

    // 2️⃣ Delete associated payment records to satisfy the 'OrderToPayment' relation constraint
    await tx.payment.deleteMany({
      where: { orderId },
    });

    // 3️⃣ Now safely delete the order
    return await tx.order.delete({
      where: { id: orderId },
    });
  }, { maxWait: 10000, timeout: 15000 });

  return result;
};

// Helper function to send CAPI Purchase asynchronously (Zero impact on response speed)
export async function sendMetaCapiPurchase(order: CapiOrder, customerEmail?: string, customerPhone?: string) {
  try {
    const pixelId = process.env.META_PIXEL_ID;
    const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
    if (!pixelId || !accessToken) return;

    const payload = buildMetaPurchasePayload(order, {
      email: customerEmail,
      phone: customerPhone,
      nowSeconds: Math.floor(Date.now() / 1000),
      siteUrl: process.env.CLIENT_URL || 'https://khushbuwaala.com',
      testEventCode: process.env.META_TEST_EVENT_CODE || undefined,
    });

    const res = await fetch(`https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${accessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    // Meta answers 4xx when the token expired or the event is malformed. This used to be silent,
    // so a broken token would lose every server-side purchase without anyone knowing.
    if (!res.ok) {
      const body: { error?: { message?: string; code?: number } } = await res.json().catch(() => ({}));
      console.error(`❌ Meta CAPI refused Purchase ${payload.data[0].event_id}: HTTP ${res.status} ${body.error?.code ?? ''} ${body.error?.message ?? ''}`);
    } else {
      console.log(`[meta capi] Purchase ${payload.data[0].event_id} accepted`);
    }
  } catch (e) {
    console.error('❌ Meta CAPI Purchase failed:', errorMessage(e));
  }
}

async function dispatchOrderEmails(fullOrder: OrderRow) {
  const ship = asAddress(fullOrder.shipping);
  const bill = asAddress(fullOrder.billing);
  const customerEmail = ship.email || bill.email || fullOrder.customer?.email || fullOrder.email;

  const customerPhone = ship.phone || bill.phone || fullOrder.customer?.phone || fullOrder.phone;

  if (customerEmail && !customerEmail.includes('@khushbuwaala.local')) {
    sendOrderConfirmationEmail(customerEmail, fullOrder).catch((err) =>
      console.error('❌ Failed to send order confirmation email to customer:', errorMessage(err))
    );
  }

  const adminEmail = process.env.ADMIN_EMAIL || 'khushbuwaala@gmail.com';
  if (adminEmail) {
    sendOrderNotificationToAdmin(adminEmail, {
      ...fullOrder,
      email: customerEmail || 'N/A',
      address: ship.address || fullOrder.address || 'N/A',
      district: ship.district || '',
      phone: customerPhone || 'N/A',
      date: new Date().toLocaleDateString('en-GB'),
      note: fullOrder.additionalNotes || 'N/A',
      cartItems: (fullOrder.orderItems || []).map((oi) => ({
        productName: oi.product?.name || 'Product',
        productImageUrls: [oi.product?.primaryImage || ''],
        size: oi.variant?.size ? `${oi.variant.size} ${oi.variant.unit || ''}`.trim() : 'Standard',
        quantity: oi.quantity,
        price: Number(oi.price || 0),
      })),
    }).catch((err) =>
      console.error('❌ Failed to send order notification email to admin:', errorMessage(err))
    );
  }
}

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
  getMonthlySalesOverview,
  trackOrders,
  deleteOrder,
};