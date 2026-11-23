import { PrismaQueryBuilder } from '../../builder/QueryBuilder';
import { prisma } from '../../../prisma/client';
import {
  OrderSource,
  OrderStatus,
  Prisma,
  SaleType,
  type OrderItemCost,
} from '@prisma/client';
import httpStatus from 'http-status';
import AppError from '../../errors/AppError';
import { dhakaDayEnd, dhakaDayStart } from '../../utils/dhakaTime';
import { generateInvoice } from '../../helpers/generateInvoice';
import { FinanceServices, snapshotOrderCosts } from '../Finance/finance.service';
import { syncStockForStatusChange, returnStockBeforeDelete, rebalanceStockForItemEdit } from '../../utils/orderStock';
import { parseOrderStatus, parseReturnCharge } from '../../utils/returnCharge';
import { isEnumValue } from '../../utils/enumValue';
import type { AuthUser } from '../../types';
import type { UpdateOrderPayload } from '../Order/order.interface';

// Treat “sales” as orders with a non-WEBSITE orderSource
const MANUAL_SOURCES: OrderSource[] = [
  OrderSource.SHOWROOM,
  OrderSource.WHOLESALE,
  OrderSource.MANUAL,
];

const INACTIVE_STATUSES = ['CANCELED', 'RETURNED'];

// A salesman may only see/change sales they recorded. Others get "not found" (no hint it exists).
const assertSalesmanOwns = (sale: { salesmanId?: string | null }, user?: AuthUser | null) => {
  if (user?.role === 'SALESMAN' && String(sale.salesmanId || '') !== String(user.id)) {
    throw new AppError(httpStatus.NOT_FOUND, 'Sale not found');
  }
};

// Re-create the cost snapshot when a sale is edited or re-activated.
// Canceled/returned sales are never snapshotted (their profit is resolved at read time).
const refreshCostSnapshotIfNeeded = async (orderId: string, status: string, force: boolean) => {
  if (INACTIVE_STATUSES.includes(String(status || '').toUpperCase())) return;

  const needsSnapshot =
    force || (await prisma.orderItemCost.count({ where: { orderId } })) === 0;

  if (!needsSnapshot) return;

  try {
    await snapshotOrderCosts(orderId);
  } catch (err) {
    console.error('❌ Failed to refresh sale cost snapshot:', err);
  }
};

// -------------------------------
// Create a manual sale (Order)
// -------------------------------
const createSale = async (
  payload: {
    customerId?: string | null;
    salesmanId?: string | null;
    saleType?: SaleType;
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
    method?: string;
    orderSource?: OrderSource;
    platform?: string;
    platformNote?: string;
    shippingCost?: number;
    discountAmount?: number;
    additionalNotes?: string;
    // Field names sent by the admin sale forms (aliases of the ones above).
    deliveryCharge?: number;
    discount?: number;
    status?: string;
    saleTime?: string;
    customerInfo?: {
      name?: string;
      phone?: string;
      email?: string;
      address?: string;
      district?: string;
      thana?: string;
      reference?: string;
    } | null;
  },
  userId?: string | null
) => {
  const {
    customerId,
    salesmanId,
    saleType,
    cartItemIds,
    items,
    amount,
    isPaid,
    method,
    orderSource,
    platform,
    platformNote,
    additionalNotes,
    customerInfo,
  } = payload;

  // Accept both naming styles so no caller silently loses data.
  const shippingCost = payload.shippingCost ?? payload.deliveryCharge;
  const discountAmount = payload.discountAmount ?? payload.discount;

  const requestedStatus = String(payload.status || '').toUpperCase();
  if (requestedStatus && !(Object.values(OrderStatus) as string[]).includes(requestedStatus)) {
    throw new AppError(httpStatus.BAD_REQUEST, `Invalid sale status: ${payload.status}`);
  }

  let saleTime: Date | undefined;
  if (payload.saleTime) {
    saleTime = new Date(payload.saleTime);
    if (Number.isNaN(saleTime.getTime())) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Invalid sale time');
    }
  }

  const noteParts = [
    additionalNotes?.trim(),
    platformNote?.trim() ? `Platform: ${platformNote.trim()}` : '',
    customerInfo?.reference?.trim() ? `Reference: ${customerInfo.reference.trim()}` : '',
  ].filter(Boolean);

  // 1️⃣ Fetch valid cart items
  // Only look up when ids are given: `in: undefined` would make Prisma drop the filter
  // and return every IN_CART row in the shop.
  const dbCartItems =
    Array.isArray(cartItemIds) && cartItemIds.length > 0
      ? await prisma.cartItem.findMany({
          where: { id: { in: cartItemIds }, status: 'IN_CART' },
          include: { product: true, variant: true },
        })
      : [];

  // Direct mode: the admin sale forms send `items` (unit price, qty, variant) and no cart ids.
  // Lines are then created inside the sale transaction, so no stray IN_CART rows are left behind
  // and nothing can merge into an older cart row (which used to inflate quantities).
  const directMode = (!cartItemIds || cartItemIds.length === 0) && Array.isArray(items) && items.length > 0;

  if (!directMode && dbCartItems.length === 0) {
    throw new AppError(httpStatus.BAD_REQUEST, 'No valid cart items found.');
  }

  let directVariants = new Map<string, Prisma.ProductVariantGetPayload<{ include: { product: true } }>>();
  if (directMode) {
    const variantIds = [...new Set(items!.map((it) => it.variantId).filter(Boolean))] as string[];
    const variants = await prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: { product: true },
    });
    directVariants = new Map(variants.map((v) => [v.id, v]));
  }

  // 2️⃣ Resolve quantities and prices from payload or DB fallback.
  // Every resolved item is tied to exactly ONE real cart item (no duplicates).
  const usedIds = new Set<string>();

  const cartItems = directMode ? items!.map((it) => {
    const variant = it.variantId ? directVariants.get(it.variantId) : null;
    if (it.variantId && !variant) {
      throw new AppError(httpStatus.BAD_REQUEST, 'A selected product size no longer exists. Please reselect it.');
    }
    const productId = String(variant?.productId || it.productId || '');
    if (!productId) throw new AppError(httpStatus.BAD_REQUEST, 'Each item needs a product.');

    const quantity = Math.max(1, Math.floor(Number(it.quantity) || 1));
    const price = Number(it.price);
    if (!Number.isFinite(price) || price < 0) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Each item needs a valid unit price.');
    }
    const originalPrice = Number(it.originalPrice ?? variant?.price ?? price);

    return {
      id: undefined as string | undefined,
      productId,
      variantId: variant?.id || null,
      size: variant?.size ?? null,
      unit: variant?.unit ?? null,
      quantity,
      price, // UNIT selling price
      originalPrice,
      discount: Math.max(0, originalPrice - price),
      product: variant?.product,
      variant,
    };
  }) : items && items.length > 0 ? items.map((it) => {
    const dbItem =
      dbCartItems.find((ci) => it.cartItemId && String(ci.id) === String(it.cartItemId)) ??
      dbCartItems.find(
        (ci) =>
          !usedIds.has(ci.id) &&
          ci.productId === it.productId &&
          (!it.variantId || ci.variantId === it.variantId)
      );

    if (!dbItem) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Cart item for product ${it.productId || it.cartItemId || ''} was not found or is no longer in the cart.`
      );
    }
    usedIds.add(dbItem.id);

    const resolvedQty = Math.max(1, Math.floor(Number(it.quantity || dbItem.quantity || 1)));
    const resolvedPrice = Number(it.price ?? dbItem.price ?? 0);
    const resolvedOriginalPrice = Number(it.originalPrice ?? dbItem.originalPrice ?? resolvedPrice);
    const unitDiscount = Math.max(0, resolvedOriginalPrice - resolvedPrice);

    return {
      id: dbItem.id,
      productId: String(it.productId || dbItem.productId || ''),
      variantId: it.variantId || dbItem.variantId || null,
      size: dbItem.size || dbItem.variant?.size || null,
      unit: dbItem.unit || dbItem.variant?.unit || null,
      quantity: resolvedQty,
      price: resolvedPrice,
      originalPrice: resolvedOriginalPrice,
      discount: unitDiscount,
      product: dbItem.product,
      variant: dbItem.variant,
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

  const subtotal = cartItems.reduce((sum, ci) => sum + Number(ci.price) * Number(ci.quantity), 0);
  const shipping = Math.max(0, Number(shippingCost || 0));
  // Order.discountAmount is an Int column; a decimal value would make Prisma reject the sale.
  const discountValue = Math.max(0, Math.round(Number(discountAmount || 0)));
  const serverAmount = amount ? Number(amount) : Math.max(0, subtotal - discountValue) + shipping;
  const invoice = await generateInvoice();

  const safeProductIds = [...new Set(cartItems.map((ci) => ci.productId).filter(Boolean))] as string[];

  // 3️⃣ Transaction: create order + link the EXISTING cart items & update inventory
  const newOrder = await prisma.$transaction(
    async (tx) => {
      const created = await tx.order.create({
        data: {
          invoice,
          customerId: customerId || null,
          salesmanId: userId || salesmanId || null,
          saleType: saleType || SaleType.SINGLE,
          amount: serverAmount,
          shippingCost: shipping,
          discountAmount: discountValue,
          isPaid: isPaid || false,
          method: method || 'cash',
          orderSource: orderSource || OrderSource.SHOWROOM,
          platform: platform || platformNote || '',
          additionalNotes: noteParts.join(' | '),
          ...(requestedStatus ? { status: requestedStatus as OrderStatus } : {}),
          ...(saleTime ? { orderTime: saleTime } : {}),
          name: customerInfo?.name || null,
          phone: customerInfo?.phone || null,
          email: customerInfo?.email || null,
          address: customerInfo?.address || null,
          shipping: {
            name: customerInfo?.name || null,
            phone: customerInfo?.phone || null,
            email: customerInfo?.email || null,
            address: customerInfo?.address || null,
            district: customerInfo?.district || null,
            thana: customerInfo?.thana || null,
          },
          billing: {
            name: customerInfo?.name || null,
            phone: customerInfo?.phone || null,
            email: customerInfo?.email || null,
            address: customerInfo?.address || null,
            district: customerInfo?.district || null,
            thana: customerInfo?.thana || null,
          },
          productIds: safeProductIds,
          // JSON snapshot only (same as createOrderWithCartItems).
          // NOTE: do NOT use orderItems.create / cartItems.connect here — that created
          // a second copy of every item and doubled the profit.
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

      // Attach the cart items to the order with the final qty/price (create them in direct mode)
      await Promise.all(
        cartItems.map((item) => {
          const lineData = {
            orderId: created.id,
            status: 'ORDERED' as const,
            quantity: item.quantity,
            price: Number(item.price),
            originalPrice: Number(item.originalPrice),
            discount: Number(item.discount),
          };
          if (!item.id) {
            return tx.cartItem.create({
              data: {
                ...lineData,
                productId: item.productId,
                variantId: item.variantId || null,
                size: item.size != null ? Math.round(Number(item.size)) : null,
                unit: item.unit || null,
              },
            });
          }
          return tx.cartItem.update({ where: { id: item.id }, data: lineData });
        })
      );

      // Stock updates & stock logs
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

      return created;
    },
    { timeout: 15000 }
  );

  // 4️⃣ Snapshot costs for finance reporting (after commit, so items are final)
  try {
    await snapshotOrderCosts(newOrder.id);
  } catch (err) {
    console.error('❌ Failed to snapshot manual sale item costs:', err);
  }

  // 5️⃣ Fetch full order with full relations matching order backends
  const fullOrder = await prisma.order.findUnique({
    where: { id: newOrder.id },
    include: {
      customer: { select: { id: true, name: true, email: true, phone: true, imageUrl: true } },
      salesman: { select: { id: true, name: true, imageUrl: true, email: true } },
      orderItems: {
        include: {
          product: { select: { id: true, name: true, primaryImage: true } },
          variant: true,
        },
      },
    },
  });

  if (!fullOrder) throw new AppError(httpStatus.NOT_FOUND, 'Sale not found after creation.');

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
// Admin: Get all manual sales with summary logic
// -------------------------------
const getAllSales = async (queryParams: Record<string, unknown>, user?: AuthUser | null) => {
  const { searchTerm, status, payment, method, source, platform, dateFrom, dateTo, productId, ...rest } = queryParams as {
    searchTerm?: string;
    status?: OrderStatus | string;
    payment?: string;
    method?: string;
    source?: OrderSource | string;
    platform?: string;
    dateFrom?: string;
    dateTo?: string;
    productId?: string;
  };

  const queryBuilder = new PrismaQueryBuilder(rest, ['id', 'customer.name']);
  const prismaQuery = queryBuilder
    .buildWhere()
    .buildSort()
    .buildPagination()
    .getQuery();

  const where: Prisma.OrderWhereInput = {
    ...prismaQuery.where,
    ...(isEnumValue(OrderSource, source) ? { orderSource: source } : { orderSource: { in: MANUAL_SOURCES } }),
  };

  // A salesman only ever sees the sales they recorded.
  if (user?.role === 'SALESMAN') where.salesmanId = user.id;

  if (isEnumValue(OrderStatus, status)) where.status = status;
  if (payment === 'PAID') where.isPaid = true;
  if (payment === 'DUE') where.isPaid = false;
  if (method && method !== 'ALL') where.method = String(method);
  if (platform && platform !== 'ALL') {
    where.platform = { equals: platform, mode: 'insensitive' };
  }

  if (dateFrom || dateTo) {
    // Bangladesh calendar days (the server runs in UTC; this used to be 06:00–06:00 Dhaka)
    where.orderTime = {
      ...(dateFrom ? { gte: dhakaDayStart(String(dateFrom)) } : {}),
      ...(dateTo ? { lte: dhakaDayEnd(String(dateTo)) } : {}),
    };
  }

  if (productId) {
    where.productIds = { has: productId };
  }

  if (searchTerm && searchTerm.trim()) {
    const s = searchTerm.trim();
    where.OR = [
      { invoice: { contains: s, mode: 'insensitive' } },
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

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const orderIncludeConfig = {
    customer: { select: { id: true, name: true, email: true, phone: true, address: true, imageUrl: true } },
    salesman: { select: { id: true, name: true, imageUrl: true, email: true } },
    orderItems: {
      include: {
        product: { select: { id: true, name: true, primaryImage: true } },
        variant: true,
      },
    },
  } satisfies Prisma.OrderInclude;

  // ✅ Fetch both paginated data AND unpaginated dataset using the exact same `where` filters for accurate summaries
  const [orders, allFilteredSales, meta] = await Promise.all([
    prisma.order.findMany({
      ...prismaQuery,
      where,
      include: orderIncludeConfig,
    }),
    prisma.order.findMany({
      where,
      include: { orderItems: true },
    }),
    queryBuilder.getPaginationMeta(() => prisma.order.count({ where })),
  ]);

  // Cost snapshots per sale (one per line), read separately
  const costsByOrder = new Map<string, OrderItemCost[]>();
  if (isSuperAdmin && orders.length > 0) {
    const allItemCosts = await prisma.orderItemCost.findMany({
      where: { orderId: { in: orders.map((o) => o.id) } },
    });
    for (const order of orders) {
      const unique = new Map<string, OrderItemCost>();
      allItemCosts.filter((c) => c.orderId === order.id).forEach((c) => unique.set(c.cartItemId || c.id, c));
      costsByOrder.set(order.id, Array.from(unique.values()));
    }
  }

  // ── Professional Summary Metrics Calculation ──
  const totalCount = allFilteredSales.length;
  let totalValidCount = 0;
  let totalCodAmount = 0;
  let totalBillAmount = 0;
  let totalRcvAmount = 0;
  let paidCount = 0;
  let dueCount = 0;

  allFilteredSales.forEach((order) => {
    const financials = FinanceServices.calculateOrderFinancials(order);
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

  const normalizedSales = orders.map((order) => {
    const customerData = order.customer || {
      id: null,
      name: order.name || null,
      phone: order.phone || null,
      email: order.email || null,
      address: order.address || null,
      imageUrl: null,
    };
    return {
      ...order,
      customer: customerData,
      // Canceled → profit 0, Returned → -courier charge (same rule as orders)
      ...(isSuperAdmin ? { orderItemCosts: FinanceServices.resolveOrderItemCosts({ ...order, orderItemCosts: costsByOrder.get(order.id) ?? [] }) } : {}),
    };
  });

  return { meta, summary, data: normalizedSales };
};

// -------------------------------
// Salesman: My Sales
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
    ...(isEnumValue(OrderSource, source) ? { orderSource: source } : { orderSource: { in: MANUAL_SOURCES } }),
  };

  if (status) where.status = status as OrderStatus;

  if (searchTerm && searchTerm.trim()) {
    const s = searchTerm.trim();
    where.OR = [
      { invoice: { contains: s, mode: 'insensitive' } },
      { name: { contains: s, mode: 'insensitive' } },
      { phone: { contains: s, mode: 'insensitive' } },
      { address: { contains: s, mode: 'insensitive' } },
    ];
  }

  const [data, allFilteredMySales, meta] = await Promise.all([
    prisma.order.findMany({
      ...prismaQuery,
      where,
      include: {
        salesman: { select: { id: true, name: true, imageUrl: true, email: true } },
        orderItems: {
          include: {
            product: { select: { id: true, name: true, primaryImage: true } },
            variant: true,
          },
        },
      },
    }),
    prisma.order.findMany({ where }),
    queryBuilder.getPaginationMeta(() => prisma.order.count({ where })),
  ]);

  const totalSalesCount = allFilteredMySales.length;
  let totalAmount = 0;

  allFilteredMySales.forEach((order) => {
    if (order.status !== 'CANCELED') {
      totalAmount += Number(order.amount || 0);
    }
  });

  return {
    meta,
    totalSales: totalSalesCount,
    totalAmount,
    data,
  };
};

// -------------------------------
// Get Sale By ID (with Super Admin Cost inclusion)
// -------------------------------
const getSaleById = async (id: string, user?: AuthUser | null) => {
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const sale = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, email: true, phone: true, address: true, imageUrl: true } },
      salesman: { select: { id: true, name: true, imageUrl: true, email: true } },
      orderItems: {
        include: {
          product: { select: { id: true, name: true, primaryImage: true } },
          variant: true,
        },
      },
    },
  });

  if (!sale) throw new AppError(httpStatus.NOT_FOUND, 'Sale not found');
  assertSalesmanOwns(sale, user);

  const itemCosts = isSuperAdmin ? await prisma.orderItemCost.findMany({ where: { orderId: sale.id } }) : [];
  const orderItemCosts = isSuperAdmin ? FinanceServices.resolveOrderItemCosts({ ...sale, orderItemCosts: itemCosts }) : undefined;

  const customerData = sale.customer || {
    id: null,
    name: sale.name || null,
    phone: sale.phone || null,
    email: sale.email || null,
    address: sale.address || null,
    imageUrl: null,
  };

  return { ...sale, customer: customerData, ...(orderItemCosts ? { orderItemCosts } : {}) };
};

// -------------------------------
// Get Sales by Customer Phone
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
      orderItems: {
        include: {
          product: { select: { id: true, name: true, primaryImage: true } },
          variant: true,
        },
      },
    },
  });

  const meta = await queryBuilder.getPaginationMeta(() => prisma.order.count({ where }));

  return { meta, data };
};

// -------------------------------
// Update Sale Status
// -------------------------------
const updateSaleStatus = async (
  id: string,
  payload: { status?: unknown; isPaid?: unknown },
  user?: AuthUser | null
) => {
  const data: Prisma.OrderUpdateInput = {};
  // a real status only (anything else used to fail in the database with a 500)
  if (payload.status) data.status = parseOrderStatus(payload.status);
  if (typeof payload.isPaid === 'boolean') data.isPaid = payload.isPaid;

  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.order.findUnique({ where: { id } });
    if (!existing) throw new AppError(httpStatus.NOT_FOUND, 'Sale not found');
    assertSalesmanOwns(existing, user);
    if (payload.status) await syncStockForStatusChange(tx, existing, String(payload.status));

    return tx.order.update({
      where: { id },
      data,
      include: {
        salesman: { select: { id: true, name: true, imageUrl: true, email: true } },
        orderItems: {
          include: {
            product: { select: { id: true, name: true, primaryImage: true } },
            variant: true,
          },
        },
      },
    });
  }, { maxWait: 10000, timeout: 15000 });

  // Re-activated sale (e.g. CANCELED -> PENDING) with no snapshot → rebuild it
  await refreshCostSnapshotIfNeeded(id, String(updated.status), false);

  return updated;
};

// -------------------------------
// Full Sale Update (Matches updateOrder)
// -------------------------------
/** PATCH /sales/update-sale: the order fields plus the sale-only ones */
type UpdateSalePayload = UpdateOrderPayload & { platform?: string; district?: string; returnChargeCollected?: unknown };

const updateSale = async (orderId: string, payload: UpdateSalePayload, user: AuthUser | null | undefined) => {
  const existing = await prisma.order.findUnique({
    where: { id: orderId },
    include: { orderItems: true },
  });
  if (!existing) throw new AppError(httpStatus.NOT_FOUND, 'Sale not found');
  assertSalesmanOwns(existing, user);

  const updated = await prisma.$transaction(
    async (tx) => {
      const data: Prisma.OrderUpdateInput = {};
      let newStatus: OrderStatus | undefined;

      if (payload.status !== undefined) {
        newStatus = parseOrderStatus(payload.status);
        data.status = newStatus;
        await syncStockForStatusChange(tx, existing, newStatus);
      }
      // courier return on a sale that went out with Steadfast (same rule as orders, D-025)
      const returnCharge = parseReturnCharge(payload, newStatus ?? existing.status);
      if (returnCharge !== undefined) data.returnChargeCollected = returnCharge;
      if (payload.isPaid !== undefined) data.isPaid = payload.isPaid;
      if (payload.method !== undefined) data.method = payload.method ?? null;
      if (payload.orderSource !== undefined) data.orderSource = payload.orderSource;
      if (payload.platform !== undefined) {
        const cleanPlatform = String(payload.platform || '').trim();

        if (!cleanPlatform || cleanPlatform.toUpperCase() === 'SHOWROOM') {
          data.platform = '';
          data.orderSource = OrderSource.SHOWROOM;
        } else {
          data.platform = cleanPlatform;
          data.orderSource = OrderSource.MANUAL;
        }
      } else if (payload.orderSource !== undefined) {
        data.orderSource = payload.orderSource;
        if (payload.orderSource === OrderSource.SHOWROOM) {
          data.platform = '';
        }
      }
      if (payload.shippingCost !== undefined) data.shippingCost = Number(payload.shippingCost);
      if (payload.discountAmount !== undefined) data.discountAmount = Math.max(0, Math.round(Number(payload.discountAmount) || 0));
      if (payload.additionalNotes !== undefined) data.additionalNotes = payload.additionalNotes ?? null;
      if (payload.amount !== undefined) data.amount = Number(payload.amount);
      if (payload.name !== undefined) data.name = payload.name;
      if (payload.phone !== undefined) data.phone = payload.phone;
      if (payload.email !== undefined) data.email = payload.email;
      if (payload.address !== undefined) data.address = payload.address;

      // The invoice prints the customer from billing/shipping (set at creation). Keep those copies in
      // step with an edit, so a corrected name or address shows on the invoice; district lives only there.
      const contact: Record<string, string | null> = {};
      for (const k of ['name', 'phone', 'email', 'address', 'district'] as const) {
        const v = payload[k];
        if (v !== undefined) contact[k] = v;
      }
      if (Object.keys(contact).length) {
        const merge = (j: unknown): Prisma.InputJsonObject => ({ ...(j && typeof j === 'object' && !Array.isArray(j) ? (j as Prisma.InputJsonObject) : {}), ...contact });
        data.shipping = merge(existing.shipping);
        data.billing = merge(existing.billing);
      }

      if (payload.salesmanId !== undefined) {
        data.salesman = payload.salesmanId ? { connect: { id: payload.salesmanId } } : { disconnect: true };
      }

      if (payload.orderItems && Array.isArray(payload.orderItems)) {
        // Stock follows the edit: only the net change per product is applied.
        await rebalanceStockForItemEdit(tx, orderId, async () => {
        const incomingItems = payload.orderItems ?? [];
        const existingItems = existing.orderItems;
        const incomingItemIds = incomingItems.map((i) => i.id).filter((id): id is string => !!id && !id.startsWith('temp_'));

        const itemsToDelete = existingItems.filter((item) => !incomingItemIds.includes(item.id));
        if (itemsToDelete.length > 0) {
          await tx.cartItem.deleteMany({
            where: { id: { in: itemsToDelete.map((i) => i.id) } },
          });
        }

        const safeProductIds: string[] = [];

        await Promise.all(
          incomingItems.map(async (item) => {
            if (item.productId) safeProductIds.push(item.productId);

            const itemPayload = {
              productId: item.productId,
              // a real id or none (a placeholder like "default_variant" made the save fail)
              variantId: item.variantId && /^[a-f0-9]{24}$/i.test(item.variantId) ? item.variantId : null,
              size: Number(item.size || 0),
              unit: item.unit || 'ML',
              quantity: Math.max(1, Number(item.quantity || 1)),
              price: Number(item.price || 0),
              status: 'ORDERED' as const,
            };

            if (item.id && !item.id.toString().startsWith('temp_')) {
              const belongs = existingItems.some((ei) => ei.id === item.id);
              if (belongs) {
                return tx.cartItem.update({
                  where: { id: item.id },
                  data: itemPayload,
                });
              }
            }

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

      return await tx.order.update({
        where: { id: orderId },
        data,
        include: {
          customer: { select: { id: true, name: true, imageUrl: true, email: true, phone: true } },
          salesman: { select: { id: true, name: true, imageUrl: true, email: true } },
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

  // Items edited → rebuild snapshot. Re-activated with no snapshot → rebuild too.
  await refreshCostSnapshotIfNeeded(
    orderId,
    String(updated.status),
    Array.isArray(payload.orderItems)
  );

  return updated;
};

// -------------------------------
// Delete Sale API
// -------------------------------
const deleteSale = async (id: string) => {
  const existing = await prisma.order.findUnique({
    where: { id },
    include: { orderItems: true },
  });

  if (!existing) {
    throw new AppError(httpStatus.NOT_FOUND, 'Sale not found');
  }

  const result = await prisma.$transaction(async (tx) => {
    // Put the stock back if this sale still holds it (was never done before)
    await returnStockBeforeDelete(tx, existing);

    // Delete associated CartItems
    await tx.cartItem.deleteMany({
      where: { orderId: id },
    });

    // Delete cost snapshots so no orphan rows remain
    await tx.orderItemCost.deleteMany({
      where: { orderId: id },
    });

    // Delete the order
    const deletedOrder = await tx.order.delete({
      where: { id },
    });

    return deletedOrder;
  }, { maxWait: 10000, timeout: 15000 });

  return result;
};

// -------------------------------
// Admin: Sales Analytics
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
    // Bangladesh calendar days, like every other report (this used UTC days)
    where.createdAt = {
      ...(startDate ? { gte: dhakaDayStart(String(startDate)) } : {}),
      ...(endDate ? { lte: dhakaDayEnd(String(endDate)) } : {}),
    };
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

export const SaleServices = {
  createSale,
  getAllSales,
  getMySales,
  getSalesByCustomer,
  updateSaleStatus,
  updateSale,
  deleteSale,
  getSalesAnalytics,
  getSaleById,
};