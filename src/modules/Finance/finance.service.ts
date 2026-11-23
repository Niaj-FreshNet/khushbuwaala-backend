import { prisma } from '../../../prisma/client';
import AppError from '../../errors/AppError';
import httpStatus from 'http-status';
import {
    IVariantPackagingCostInput,
    IStockPurchaseInput,
    IComboPackagingCostInput
} from './finance.interface';
import { PRODUCT_ERROR_MESSAGES } from '../Product/product.constant';
import { asAddress } from '../../types/records';
import type { Prisma, ProductVariant } from '@prisma/client';

// ---------- helpers (add near the top, below imports) ----------
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const COURIER_FALLBACK = { DHAKA: 55, OUTSIDE: 115 };
const COD_FEE_RATE = 0.01;
const COURIER_ENGAGED_STATUSES = ['SHIPPED', 'DELIVERED', 'COMPLETED'];

const isYmd = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Day boundaries in Asia/Dhaka (UTC+6), returned as real UTC instants. */
const resolveDhakaRange = (startDate?: string, endDate?: string) => {
    if (isYmd(startDate) && isYmd(endDate)) {
        const start = new Date(`${startDate}T00:00:00.000+06:00`);
        const end = new Date(`${endDate}T23:59:59.999+06:00`);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            throw new AppError(httpStatus.BAD_REQUEST, 'Invalid date range.');
        }
        if (start > end) {
            throw new AppError(httpStatus.BAD_REQUEST, 'Start date cannot be after end date.');
        }
        return { start, end };
    }
    // Default: current month in Dhaka
    const dhakaNow = new Date(Date.now() + DHAKA_OFFSET_MS);
    const y = dhakaNow.getUTCFullYear();
    const m = dhakaNow.getUTCMonth();
    return {
        start: new Date(Date.UTC(y, m, 1) - DHAKA_OFFSET_MS),
        end: new Date(Date.UTC(y, m + 1, 1) - DHAKA_OFFSET_MS - 1),
    };
};

/** The order fields the money rules read; any order row (lean select or full) fits. */
export type OrderMoneyInput = {
    status?: string | null;
    orderSource?: string | null;
    method?: string | null;
    amount?: number | null;
    isPaid?: boolean | null;
    shippingCost?: number | null;
    deliveryCharge?: number | null;
    discountAmount?: number | null;
    returnChargeCollected?: number | null;
    shipping?: unknown; // JSON address
    orderItems?: { price?: number | null; quantity?: number | null }[] | null;
    cartItems?: unknown; // older orders: JSON copy of the lines
};

type MoneyLine = { price?: unknown; quantity?: unknown; qty?: unknown };
/** The order's lines: real lines, else the JSON copy older orders kept */
const linesOf = (order: OrderMoneyInput): MoneyLine[] =>
    order.orderItems || (Array.isArray(order.cartItems) ? (order.cartItems as MoneyLine[]) : []);

export const resolveCourierCharge = (order: OrderMoneyInput): number => {
    // The courier's real fee when Steadfast told us (webhook delivery_charge), else the estimate
    const actual = Number(order.deliveryCharge) || 0;
    if (actual > 0) return actual;
    const shipping = Number(order.shippingCost) || 0;
    if (shipping > 0) return shipping;
    const isDhaka = String(asAddress(order.shipping).district || '').toLowerCase().includes('dhaka');
    return isDhaka ? COURIER_FALLBACK.DHAKA : COURIER_FALLBACK.OUTSIDE;
};

/**
 * Courier return ("return to origin"): the parcel went out with the courier and came back.
 *  - RETURNED: customer refused and did NOT pay the delivery charge -> we lose the courier fee.
 *  - CANCELED with returnChargeCollected set: customer refused but paid the delivery charge
 *    (Steadfast "partial_delivered" in this shop) -> collected - fee, usually about 0.
 * Other CANCELED orders never cost a courier fee (cancelled before shipping).
 * Showroom sales never have one.
 */
export const courierReturnResult = (order: OrderMoneyInput) => {
    const status = String(order.status || '').toUpperCase();
    const collectedSet = order.returnChargeCollected !== null && order.returnChargeCollected !== undefined;
    const isReturn = order.orderSource !== 'SHOWROOM' && (status === 'RETURNED' || (status === 'CANCELED' && collectedSet));
    if (!isReturn) return null;
    const fee = resolveCourierCharge(order);
    const collected = Math.max(0, Number(order.returnChargeCollected) || 0);
    return { fee, collected, net: collected - fee };
};

// Cash on delivery only. (It used to match any method containing 'cash', so a shipped order paid in
// cash beforehand would have been charged Steadfast's 1% COD fee.)
export const isCodMethod = (method?: string | null) => {
    const m = String(method || '').toLowerCase();
    return m === 'cashondelivery' || m === 'cod';
};

// ==========================================
// 1. PACKAGING COSTS (Fixed Setup)
// ==========================================

const upsertVariantPackagingCost = async (sku: string, payload: IVariantPackagingCostInput) => {
    const totalCost = payload.costLines.reduce((sum, line) => sum + line.amount, 0);

    const variant = await prisma.productVariant.findUnique({ where: { sku } });
    if (!variant) throw new AppError(httpStatus.NOT_FOUND, `Variant with SKU ${sku} not found.`);

    return await prisma.variantPackagingCost.upsert({
        where: { sku },
        update: { costLines: payload.costLines, totalCost },
        create: { sku, costLines: payload.costLines, totalCost },
    });
};

const upsertComboPackagingCost = async (comboId: string, payload: IComboPackagingCostInput) => {
    const totalCost = payload.costLines.reduce((sum, line) => sum + line.amount, 0);

    return await prisma.comboPackagingCost.upsert({
        where: { comboId },
        update: { costLines: payload.costLines, totalCost },
        create: { comboId, costLines: payload.costLines, totalCost },
    });
};

const getPackagingCostsBySku = async (sku: string) => {
    return await prisma.variantPackagingCost.findUnique({ where: { sku } });
};

// ==========================================
// 2. STOCK PURCHASES & WAC (Dynamic Inventory)
// ==========================================

const addStockPurchaseAndUpdateWAC = async (payload: IStockPurchaseInput) => {
    const { productId, quantity: rawQuantity, costLines, supplier, billNo, note, unit, createdById } = payload;
    const quantity = Number(rawQuantity);

    const sanitizedNote = note && String(note).trim() !== '' ? String(note).trim() : null;

    if (!(Number(quantity) > 0)) throw new AppError(httpStatus.BAD_REQUEST, 'Quantity must be greater than 0');
    if (!Array.isArray(costLines) || !costLines.length) throw new AppError(httpStatus.BAD_REQUEST, 'At least one cost line is required');
    for (const line of costLines) {
        const a = Number(line?.amount);
        if (!Number.isFinite(a) || a < 0) throw new AppError(httpStatus.BAD_REQUEST, 'Cost amounts must be 0 or more');
        line.amount = a; // "500" from a form field would otherwise be added as text
    }

    const totalPurchaseCost = costLines.reduce((sum, line) => sum + line.amount, 0);
    const costPerUnit = totalPurchaseCost / Number(quantity);

    return await prisma.$transaction(async (tx) => {
        const product = await tx.product.findUnique({ where: { id: productId } });
        if (!product) throw new AppError(httpStatus.NOT_FOUND, PRODUCT_ERROR_MESSAGES.NOT_FOUND);

        const currentCostData = await tx.productCost.findUnique({ where: { productId } });

        // Negative stock (sold before stock was recorded) must not drag the average cost down/negative.
        const currentStock = Math.max(0, product.stock || 0);
        const currentAvgCost = currentCostData?.avgCostPerUnit || 0;

        // Calculate New WAC
        const totalCurrentValue = currentStock * currentAvgCost;
        const newTotalStock = currentStock + quantity;
        const newAvgCostPerUnit = newTotalStock > 0 ? (totalCurrentValue + totalPurchaseCost) / newTotalStock : 0;

        // 1. Log Purchase
        const purchase = await tx.stockPurchase.create({
            data: {
                productId,
                quantity,
                unit,
                totalCost: totalPurchaseCost,
                costPerUnit,
                costLines,
                supplier,
                billNo,
                note: sanitizedNote,
                createdById,
                isOpening: currentStock === 0,
            },
        });

        // 2. Update WAC
        await tx.productCost.upsert({
            where: { productId },
            update: { avgCostPerUnit: newAvgCostPerUnit, lastCostPerUnit: costPerUnit },
            create: { productId, avgCostPerUnit: costPerUnit, lastCostPerUnit: costPerUnit },
        });

        // 3. Update Product Stock
        await tx.product.update({
            where: { id: productId },
            data: { stock: { increment: quantity } },
        });

        // 4. Log General Stock History
        await tx.stockLog.create({
            data: {
                productId,
                change: quantity,
                reason: `Purchase Bill: ${billNo || 'N/A'} - Supp: ${supplier || 'N/A'}`,
            },
        });

        return purchase;
    });
};

const getProductLiveWAC = async (productId: string) => {
    return await prisma.productCost.findUnique({ where: { productId } });
};

// ==========================================
// 3. ORDER SNAPSHOTS (Checkout & Webhooks)
// ==========================================

export const snapshotOrderCosts = async (orderId: string) => {
    const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { orderItems: { include: { variant: true } } }
    });

    if (!order) return;

    // Older orders: some have no line records (only the JSON item list on the order) and many
    // lines store product + size but no variantId. Both used to be skipped, so those orders
    // were missing from Finance (83 orders on 2026-11-22). Fall back sensibly instead.
    type JsonLine = { productId?: string; variantId?: string; size?: number; unit?: string; quantity?: unknown; price?: unknown };
    const jsonItems = Array.isArray(order.cartItems) ? (order.cartItems as JsonLine[]) : [];
    type SnapshotLine = {
        id?: string; productId?: string | null; variantId?: string | null; size?: number | null; unit?: string | null;
        quantity: number; price: number; variant: ProductVariant | null;
    };
    const sourceItems: SnapshotLine[] = order.orderItems.length
        ? order.orderItems
        : jsonItems.map((ci) => ({ id: undefined, productId: ci.productId, variantId: ci.variantId, size: ci.size, unit: ci.unit, quantity: Number(ci.quantity) || 1, price: Number(ci.price) || 0, variant: null }));
    if (!sourceItems.length) return;

    // Deduplicate order items by ID to avoid duplicate snapshots
    const uniqueItemsMap = new Map<string, SnapshotLine>();
    sourceItems.forEach((item, i) => uniqueItemsMap.set(item.id ?? `json-${i}`, item));
    const orderItems = Array.from(uniqueItemsMap.values());

    const costSnapshots = [];

    // Re-snapshot after an edit: a line that was already costed keeps its frozen cost (same line,
    // same size); only new or changed-size lines are costed at today's average. Otherwise editing
    // one item re-priced the whole order's history.
    const previous = await prisma.orderItemCost.findMany({ where: { orderId } });
    const frozenByLine = new Map(previous.filter((p) => p.cartItemId).map((p) => [String(p.cartItemId), p]));

    for (const item of orderItems) {
        if (!item.productId) continue;
        const frozen = item.id ? frozenByLine.get(String(item.id)) : undefined;
        if (frozen && (!item.variantId || !frozen.variantId || String(frozen.variantId) === String(item.variantId))) {
            const qty = Number(item.quantity) || 1;
            const revenue = Number(item.price) * qty;
            costSnapshots.push({
                orderId: order.id, cartItemId: item.id, productId: item.productId, variantId: frozen.variantId,
                quantity: qty, sellingUnitPrice: Number(item.price),
                liquidUnitCost: frozen.liquidUnitCost, packagingUnitCost: frozen.packagingUnitCost, unitCost: frozen.unitCost,
                totalCost: frozen.unitCost * qty, totalRevenue: revenue, profit: revenue - frozen.unitCost * qty,
                costMissing: frozen.costMissing,
            });
            continue;
        }
        // Resolve the size: the linked variant, else the product's variant with the same size (and unit)
        if (!item.variant && item.variantId) {
            item.variant = await prisma.productVariant.findUnique({ where: { id: String(item.variantId) } }).catch(() => null);
        }
        if (!item.variant && item.size != null) {
            const candidates = await prisma.productVariant.findMany({ where: { productId: String(item.productId), size: Number(item.size) } });
            item.variant =
                candidates.find((v) => !item.unit || String(v.unit).toUpperCase() === String(item.unit).toUpperCase()) ?? candidates[0] ?? null;
        }
        if (!item.variant) continue;
        item.variantId = item.variant.id;

        const [productCost, variantPkgCost] = await Promise.all([
            prisma.productCost.findUnique({ where: { productId: item.productId } }),
            prisma.variantPackagingCost.findUnique({ where: { sku: item.variant.sku } })
        ]);

        const liquidUnitCostPerML = productCost?.avgCostPerUnit || 0;
        const packagingUnitCost = variantPkgCost?.totalCost || 0;

        const totalLiquidCostForBottle = liquidUnitCostPerML * (item.variant.size || 0);
        const singleItemTotalCost = totalLiquidCostForBottle + packagingUnitCost;

        const lineItemTotalCost = singleItemTotalCost * item.quantity;
        const lineItemRevenue = item.price * item.quantity;
        const lineItemProfit = lineItemRevenue - lineItemTotalCost;

        costSnapshots.push({
            orderId: order.id,
            cartItemId: item.id,
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            sellingUnitPrice: item.price,
            liquidUnitCost: totalLiquidCostForBottle,
            packagingUnitCost: packagingUnitCost,
            unitCost: singleItemTotalCost,
            totalCost: lineItemTotalCost,
            totalRevenue: lineItemRevenue,
            profit: lineItemProfit,
            costMissing: !productCost || !variantPkgCost
        });
    }

    if (costSnapshots.length > 0) {
        await prisma.$transaction([
            prisma.orderItemCost.deleteMany({ where: { orderId } }),
            prisma.orderItemCost.createMany({ data: costSnapshots }),
        ]);
    }
};

export const reverseOrderCosts = async (orderId: string) => {
    return await prisma.orderItemCost.deleteMany({
        where: { orderId }
    });
};

// ==========================================
// 4. FINANCIAL SUMMARY & P&L REPORTING
// ==========================================

export const getFinancialSummary = async (query: { startDate?: string; endDate?: string }) => {
    const { start: startUtc, end: endUtc } = resolveDhakaRange(query.startDate, query.endDate);

    const periodOrders = await prisma.order.findMany({
        where: { orderTime: { gte: startUtc, lte: endUtc } },
        select: {
            id: true,
            status: true,
            orderSource: true,
            method: true,
            shippingCost: true,
            discountAmount: true,
            shipping: true,
            deliveryCharge: true,
            returnChargeCollected: true,
        },
    });
    // Plain cancellations (never shipped) are left out; courier returns count for their fee.
    const orders = periodOrders.filter((o) => o.status !== 'CANCELED' || courierReturnResult(o));

    const returnedOrders = orders.filter((o) => o.status === 'RETURNED' || o.status === 'CANCELED');
    const validOrders = orders.filter((o) => o.status !== 'RETURNED' && o.status !== 'CANCELED');
    const validOrderIds = validOrders.map((o) => o.id);

    const [itemCosts, expenses, stockPurchases] = await Promise.all([
        prisma.orderItemCost.findMany({
            where: { orderId: { in: validOrderIds } },
            select: {
                orderId: true,
                quantity: true,
                totalRevenue: true,
                totalCost: true,
                liquidUnitCost: true,
                packagingUnitCost: true,
                costMissing: true,
            },
        }),
        prisma.expense.findMany({
            where: { expenseTime: { gte: startUtc, lte: endUtc }, status: 'COMPLETED' },
            select: { amount: true },
        }),
        prisma.stockPurchase.findMany({
            where: { purchaseDate: { gte: startUtc, lte: endUtc } },
            select: { totalCost: true },
        }),
    ]);

    // ---- Revenue & COGS from frozen snapshots ----
    let grossSales = 0;
    let totalCOGS = 0;
    let totalLiquidCost = 0;
    let totalPackagingCost = 0;
    let missingCostItemCount = 0;

    const revenueByOrder = new Map<string, number>();
    const missingCostOrders = new Set<string>();

    for (const item of itemCosts) {
        grossSales += item.totalRevenue;
        totalCOGS += item.totalCost;
        totalLiquidCost += item.liquidUnitCost * item.quantity;
        totalPackagingCost += item.packagingUnitCost * item.quantity;
        revenueByOrder.set(item.orderId, (revenueByOrder.get(item.orderId) || 0) + item.totalRevenue);
        if (item.costMissing) {
            missingCostItemCount++;
            missingCostOrders.add(item.orderId);
        }
    }

    // ---- Order-level discounts (coupons), only for orders that are in the ledger ----
    let totalOrderDiscounts = 0;
    for (const o of validOrders) {
        if (revenueByOrder.has(o.id)) totalOrderDiscounts += Number(o.discountAmount) || 0;
    }

    const totalRevenue = grossSales - totalOrderDiscounts; // net revenue
    const grossProfit = totalRevenue - totalCOGS;

    // ---- Fulfillment costs (courier-based orders only; showroom has none) ----
    let returnedCourierLoss = 0;     // courier fees paid on parcels that came back
    let returnChargesCollected = 0;  // delivery charges customers still paid on those returns
    let freeShippingCourierCost = 0;
    let codFees = 0;
    let totalShippingCollected = 0;

    for (const o of returnedOrders) {
        const r = courierReturnResult(o);
        if (!r) continue;
        returnedCourierLoss += r.fee;
        returnChargesCollected += r.collected;
    }

    for (const o of validOrders) {
        if (o.orderSource === 'SHOWROOM') continue;
        totalShippingCollected += Number(o.shippingCost) || 0;

        if (!COURIER_ENGAGED_STATUSES.includes(o.status)) continue; // not shipped yet

        // Customer-paid shipping offsets the courier fee; free shipping is a real cost to us
        if (!(Number(o.shippingCost) > 0)) freeShippingCourierCost += resolveCourierCharge(o);

        if (isCodMethod(o.method)) {
            codFees += Math.round((revenueByOrder.get(o.id) || 0) * COD_FEE_RATE);
        }
    }

    const totalFulfillmentCosts = returnedCourierLoss - returnChargesCollected + freeShippingCourierCost + codFees;

    const totalOperatingExpenses = expenses.reduce((s, e) => s + e.amount, 0);
    const netProfit = grossProfit - totalFulfillmentCosts - totalOperatingExpenses;
    const totalInventoryInvestment = stockPurchases.reduce((s, p) => s + p.totalCost, 0);

    const pct = (v: number) => (totalRevenue > 0 ? Number(((v / totalRevenue) * 100).toFixed(2)) : 0);

    return {
        period: { startDate: startUtc.toISOString(), endDate: endUtc.toISOString() },
        metrics: {
            grossSales,
            totalOrderDiscounts,
            totalRevenue,
            totalShippingCollected,
            totalCOGS,
            grossProfit,
            grossMarginPercentage: pct(grossProfit),
            returnedCourierLoss,
            returnChargesCollected,
            netReturnLoss: returnedCourierLoss - returnChargesCollected,
            freeShippingCourierCost,
            codFees,
            totalFulfillmentCosts,
            totalOperatingExpenses,
            netProfit,
            netMarginPercentage: pct(netProfit),
            totalInventoryInvestment,
        },
        breakdown: {
            totalLiquidCost,
            totalPackagingCost,
            expenseCount: expenses.length,
            orderCount: validOrders.length,     // valid (not canceled / returned)
            returnedCount: returnedOrders.filter((o) => o.status === 'RETURNED').length,
            courierReturnCount: returnedOrders.length, // RETURNED + charge-paid courier returns (CANCELED)
            missingCostItemCount,
            missingCostOrderCount: missingCostOrders.size,
            unsyncedOrderCount: validOrders.filter((o) => !revenueByOrder.has(o.id)).length,
        },
    };
};

// ==========================================
// 5. HISTORICAL BACKFILL & CORE CALCULATIONS
// ==========================================

const backfillHistoricalOrderCosts = async (orderIds?: string[]) => {
    const whereClause: Prisma.OrderWhereInput = {
        status: { notIn: ['CANCELED', 'RETURNED'] }
    };

    if (orderIds && orderIds.length > 0) {
        whereClause.id = { in: orderIds };
    } else {
        whereClause.OR = [
            { orderItemCosts: { none: {} } },
            { orderItemCosts: { some: { costMissing: true } } },
        ];
    }

    const targetOrders = await prisma.order.findMany({
        where: whereClause,
        select: { id: true }
    });

    if (targetOrders.length === 0) {
        return { message: "No matching orders found to sync." };
    }

    let backfilledCount = 0;
    for (const order of targetOrders) {
        await snapshotOrderCosts(order.id);
        backfilledCount++;
    }

    return {
        message: `Successfully synced cost snapshots for ${backfilledCount} orders.`
    };
};

// 2. Add manual profit override function
const overrideOrderProfit = async (orderId: string, manualProfit: number) => {
    // Finds the first cost snapshot or updates total profit for the order
    const costRecord = await prisma.orderItemCost.findFirst({
        where: { orderId }
    });

    if (!costRecord) {
        throw new AppError(httpStatus.NOT_FOUND, "No cost snapshot found for this order to override.");
    }

    return await prisma.orderItemCost.update({
        where: { id: costRecord.id },
        data: { profit: manualProfit, totalCost: costRecord.totalRevenue - manualProfit }
    });
};

export const calculateOrderFinancials = (order: OrderMoneyInput) => {
    const orderStatus = String(order.status || "").toUpperCase();
    const isCanceledOrReturned = orderStatus === "CANCELED" || orderStatus === "RETURNED";
    const isDeliveredOrCompleted = orderStatus === "DELIVERED" || orderStatus === "COMPLETED";

    // 🏷️ Check if it's a Showroom sale (no delivery charges / courier loss)
    const isShowroom = order.orderSource === "SHOWROOM";

    const orderItems = linesOf(order);
    const shipping = Number(order.shippingCost || 0);
    const itemsSubtotal = orderItems.reduce((acc: number, it) => acc + (Number(it.price || 0) * Number(it.quantity || it.qty || 1)), 0);
    const productBill = itemsSubtotal > 0 ? itemsSubtotal : Math.max(0, Number(order.amount || 0) - shipping);

    const districtLower = String(asAddress(order.shipping).district || "").toLowerCase();
    const isDhaka = districtLower.includes("dhaka");
    const courierDeliveryCharge = isShowroom ? 0 : (shipping > 0 ? shipping : (isDhaka ? 55 : 115));

    const isShippingIncludedInCod = shipping > 0;
    const effectiveDeliveryDeduction = isShowroom || isShippingIncludedInCod ? 0 : courierDeliveryCharge;

    // cash on delivery only (a shipped order paid in cash beforehand has no COD fee)
    const isCod = !isShowroom && isCodMethod(order.method);
    const codCharge = isCod ? Math.round(productBill * 0.01) : 0;

    // Sales figure = what the customer pays for products: item lines minus order discounts
    // (coupons / extra discount), the same rule the Finance summary uses.
    const billAfterDiscount = Math.max(0, productBill - (Number(order.discountAmount) || 0));
    const validBill = !isCanceledOrReturned ? (isShowroom ? Number(order.amount || billAfterDiscount) : billAfterDiscount) : 0;
    const isValidOrderCount = !isCanceledOrReturned ? 1 : 0;

    let netReceivable = 0;
    if (isShowroom) {
        // Showroom sales are instant full cash received if paid or completed
        netReceivable = !isCanceledOrReturned ? Number(order.amount || productBill) : 0;
    } else if (isDeliveredOrCompleted && order.isPaid === true) {
        netReceivable = Math.max(0, productBill - effectiveDeliveryDeduction - codCharge);
    } else if (courierReturnResult(order)) {
        // Parcel came back: collected delivery charge minus the courier fee
        netReceivable = courierReturnResult(order)!.net;
    } else {
        netReceivable = 0;
    }

    return {
        productBill: validBill,
        netReceivable,
        isValidOrderCount,
        isCanceledOrReturned,
        isPaid: Boolean(order.isPaid),
        courierDeliveryCharge
    };
};

export const resolveOrderItemCosts = <C>(order: OrderMoneyInput & { orderItemCosts?: C[] | null }): (C | { profit: number })[] => {
    const status = String(order.status || "").toUpperCase();
    const ret = courierReturnResult(order);
    if (ret) return [{ profit: ret.net }];
    if (status === "CANCELED" || status === "RETURNED") return [{ profit: 0 }];
    return order.orderItemCosts || [];
};

export const getLedgerTransactions = async (query: { startDate?: string; endDate?: string; type?: string }) => {
    // Same Bangladesh-day range as the summary, so ledger and summary always cover the same period
    // (this used server UTC days, i.e. 06:00–06:00 Dhaka).
    const { start: startUtc, end: endUtc } = resolveDhakaRange(query.startDate, query.endDate);

    // 1. Fetch Paid Orders (CREDITS)
    const orders = await prisma.order.findMany({
        where: {
            orderTime: { gte: startUtc, lte: endUtc },
            status: { notIn: ['CANCELED', 'RETURNED'] },
            isPaid: true
        },
        select: { id: true, invoice: true, orderTime: true, amount: true, method: true, customer: { select: { name: true } } }
    });

    // 1b. Courier returns: fee paid (DEBIT) and delivery charge the customer still paid (CREDIT)
    const returnOrders = (await prisma.order.findMany({
        where: { orderTime: { gte: startUtc, lte: endUtc }, status: { in: ['CANCELED', 'RETURNED'] } },
        select: { id: true, invoice: true, orderTime: true, status: true, orderSource: true, shippingCost: true, deliveryCharge: true, returnChargeCollected: true, shipping: true },
    })).filter((o) => courierReturnResult(o));

    // 2. Fetch Completed Expenses (DEBITS)
    const expenses = await prisma.expense.findMany({
        where: {
            expenseTime: { gte: startUtc, lte: endUtc },
            status: 'COMPLETED',
        },
        select: { id: true, title: true, expenseTime: true, amount: true, method: true, reference: true }
    });

    // 3. Fetch Stock Purchases (DEBITS)
    const purchases = await prisma.stockPurchase.findMany({
        where: {
            purchaseDate: { gte: startUtc, lte: endUtc },
        },
        select: { id: true, billNo: true, supplier: true, purchaseDate: true, totalCost: true }
    });

    // Format and combine all entries
    type LedgerLine = { id: string; date: Date; type: 'CREDIT' | 'DEBIT'; source: string; description: string; method: string; amount: number; reference: string };
    let ledger: LedgerLine[] = [];

    orders.forEach(o => {
        ledger.push({
            id: o.id,
            date: o.orderTime,
            type: 'CREDIT',
            source: 'ORDER',
            description: `Sale #${o.invoice} ${o.customer?.name ? `(${o.customer.name})` : ''}`,
            method: o.method || 'Unknown',
            amount: o.amount,
            reference: o.invoice
        });
    });

    returnOrders.forEach((o) => {
        const r = courierReturnResult(o)!;
        if (r.fee > 0) ledger.push({
            id: `${o.id}-rfee`, date: o.orderTime, type: 'DEBIT', source: 'RETURN',
            description: `Courier fee, returned parcel #${o.invoice}`, method: 'Courier', amount: r.fee, reference: o.invoice,
        });
        if (r.collected > 0) ledger.push({
            id: `${o.id}-rcol`, date: o.orderTime, type: 'CREDIT', source: 'RETURN',
            description: `Delivery charge paid on return #${o.invoice}`, method: 'Courier', amount: r.collected, reference: o.invoice,
        });
    });

    expenses.forEach(e => {
        ledger.push({
            id: e.id,
            date: e.expenseTime,
            type: 'DEBIT',
            source: 'EXPENSE',
            description: e.title || 'General Expense',
            method: e.method || 'Cash',
            amount: e.amount,
            reference: e.reference || `EXP-${e.id.slice(0, 6)}`
        });
    });

    purchases.forEach(p => {
        ledger.push({
            id: p.id,
            date: p.purchaseDate,
            type: 'DEBIT',
            source: 'PURCHASE',
            description: `Stock Purchase ${p.supplier ? `from ${p.supplier}` : ''}`,
            method: 'N/A',
            amount: p.totalCost,
            reference: p.billNo || `PUR-${p.id.slice(0, 6)}`
        });
    });

    // Sort by date (Newest first)
    ledger.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Filter by type if requested
    if (query.type && query.type !== 'ALL') {
        ledger = ledger.filter(l => l.type === query.type);
    }

    // Calculate Totals
    let totalCredits = 0;
    let totalDebits = 0;
    ledger.forEach(l => {
        if (l.type === 'CREDIT') totalCredits += l.amount;
        if (l.type === 'DEBIT') totalDebits += l.amount;
    });

    return {
        metrics: {
            totalCredits,
            totalDebits,
            netCashFlow: totalCredits - totalDebits,
            transactionCount: ledger.length
        },
        data: ledger
    };
};

export const FinanceServices = {
    upsertVariantPackagingCost,
    upsertComboPackagingCost,
    getPackagingCostsBySku,
    addStockPurchaseAndUpdateWAC,
    getProductLiveWAC,
    snapshotOrderCosts,
    reverseOrderCosts,
    getFinancialSummary,
    backfillHistoricalOrderCosts,
    overrideOrderProfit,
    calculateOrderFinancials,
    resolveOrderItemCosts,
    getLedgerTransactions,
};