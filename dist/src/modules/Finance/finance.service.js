"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinanceServices = exports.getLedgerTransactions = exports.resolveOrderItemCosts = exports.calculateOrderFinancials = exports.getFinancialSummary = exports.reverseOrderCosts = exports.snapshotOrderCosts = exports.resolveCourierCharge = void 0;
const client_1 = require("../../../prisma/client");
const AppError_1 = __importDefault(require("../../errors/AppError"));
const http_status_1 = __importDefault(require("http-status"));
const product_constant_1 = require("../Product/product.constant");
// ---------- helpers (add near the top, below imports) ----------
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const COURIER_FALLBACK = { DHAKA: 55, OUTSIDE: 115 };
const COD_FEE_RATE = 0.01;
const COURIER_ENGAGED_STATUSES = ['SHIPPED', 'DELIVERED', 'COMPLETED'];
const isYmd = (s) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
/** Day boundaries in Asia/Dhaka (UTC+6), returned as real UTC instants. */
const resolveDhakaRange = (startDate, endDate) => {
    if (isYmd(startDate) && isYmd(endDate)) {
        const start = new Date(`${startDate}T00:00:00.000+06:00`);
        const end = new Date(`${endDate}T23:59:59.999+06:00`);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Invalid date range.');
        }
        if (start > end) {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Start date cannot be after end date.');
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
const resolveCourierCharge = (order) => {
    var _a;
    const shipping = Number(order.shippingCost) || 0;
    if (shipping > 0)
        return shipping;
    const isDhaka = String(((_a = order.shipping) === null || _a === void 0 ? void 0 : _a.district) || '').toLowerCase().includes('dhaka');
    return isDhaka ? COURIER_FALLBACK.DHAKA : COURIER_FALLBACK.OUTSIDE;
};
exports.resolveCourierCharge = resolveCourierCharge;
const isCodMethod = (method) => {
    const m = String(method || '').toLowerCase();
    return m.includes('cash') || m.includes('cod');
};
// ==========================================
// 1. PACKAGING COSTS (Fixed Setup)
// ==========================================
const upsertVariantPackagingCost = (sku, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const totalCost = payload.costLines.reduce((sum, line) => sum + line.amount, 0);
    const variant = yield client_1.prisma.productVariant.findUnique({ where: { sku } });
    if (!variant)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, `Variant with SKU ${sku} not found.`);
    return yield client_1.prisma.variantPackagingCost.upsert({
        where: { sku },
        update: { costLines: payload.costLines, totalCost },
        create: { sku, costLines: payload.costLines, totalCost },
    });
});
const upsertComboPackagingCost = (comboId, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const totalCost = payload.costLines.reduce((sum, line) => sum + line.amount, 0);
    return yield client_1.prisma.comboPackagingCost.upsert({
        where: { comboId },
        update: { costLines: payload.costLines, totalCost },
        create: { comboId, costLines: payload.costLines, totalCost },
    });
});
const getPackagingCostsBySku = (sku) => __awaiter(void 0, void 0, void 0, function* () {
    return yield client_1.prisma.variantPackagingCost.findUnique({ where: { sku } });
});
// ==========================================
// 2. STOCK PURCHASES & WAC (Dynamic Inventory)
// ==========================================
const addStockPurchaseAndUpdateWAC = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    const { productId, quantity, costLines, supplier, billNo, note, unit, createdById } = payload;
    const sanitizedNote = note && note.trim() !== '' ? note.trim() : null;
    const totalPurchaseCost = costLines.reduce((sum, line) => sum + line.amount, 0);
    const costPerUnit = totalPurchaseCost / quantity;
    return yield client_1.prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
        const product = yield tx.product.findUnique({ where: { id: productId } });
        if (!product)
            throw new AppError_1.default(http_status_1.default.NOT_FOUND, product_constant_1.PRODUCT_ERROR_MESSAGES.NOT_FOUND);
        const currentCostData = yield tx.productCost.findUnique({ where: { productId } });
        const currentStock = product.stock || 0;
        const currentAvgCost = (currentCostData === null || currentCostData === void 0 ? void 0 : currentCostData.avgCostPerUnit) || 0;
        // Calculate New WAC
        const totalCurrentValue = currentStock * currentAvgCost;
        const newTotalStock = currentStock + quantity;
        const newAvgCostPerUnit = newTotalStock > 0 ? (totalCurrentValue + totalPurchaseCost) / newTotalStock : 0;
        // 1. Log Purchase
        const purchase = yield tx.stockPurchase.create({
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
        yield tx.productCost.upsert({
            where: { productId },
            update: { avgCostPerUnit: newAvgCostPerUnit, lastCostPerUnit: costPerUnit },
            create: { productId, avgCostPerUnit: costPerUnit, lastCostPerUnit: costPerUnit },
        });
        // 3. Update Product Stock
        yield tx.product.update({
            where: { id: productId },
            data: { stock: { increment: quantity } },
        });
        // 4. Log General Stock History
        yield tx.stockLog.create({
            data: {
                productId,
                change: quantity,
                reason: `Purchase Bill: ${billNo || 'N/A'} - Supp: ${supplier || 'N/A'}`,
            },
        });
        return purchase;
    }));
});
const getProductLiveWAC = (productId) => __awaiter(void 0, void 0, void 0, function* () {
    return yield client_1.prisma.productCost.findUnique({ where: { productId } });
});
// ==========================================
// 3. ORDER SNAPSHOTS (Checkout & Webhooks)
// ==========================================
const snapshotOrderCosts = (orderId) => __awaiter(void 0, void 0, void 0, function* () {
    const order = yield client_1.prisma.order.findUnique({
        where: { id: orderId },
        include: { orderItems: { include: { variant: true } } }
    });
    if (!order || !order.orderItems.length)
        return;
    // Deduplicate order items by ID to avoid duplicate snapshots
    const uniqueItemsMap = new Map();
    for (const item of order.orderItems) {
        uniqueItemsMap.set(item.id, item);
    }
    const orderItems = Array.from(uniqueItemsMap.values());
    const costSnapshots = [];
    for (const item of orderItems) {
        if (!item.productId || !item.variantId || !item.variant)
            continue;
        const [productCost, variantPkgCost] = yield Promise.all([
            client_1.prisma.productCost.findUnique({ where: { productId: item.productId } }),
            client_1.prisma.variantPackagingCost.findUnique({ where: { sku: item.variant.sku } })
        ]);
        const liquidUnitCostPerML = (productCost === null || productCost === void 0 ? void 0 : productCost.avgCostPerUnit) || 0;
        const packagingUnitCost = (variantPkgCost === null || variantPkgCost === void 0 ? void 0 : variantPkgCost.totalCost) || 0;
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
        yield client_1.prisma.$transaction([
            client_1.prisma.orderItemCost.deleteMany({ where: { orderId } }),
            client_1.prisma.orderItemCost.createMany({ data: costSnapshots }),
        ]);
    }
});
exports.snapshotOrderCosts = snapshotOrderCosts;
const reverseOrderCosts = (orderId) => __awaiter(void 0, void 0, void 0, function* () {
    return yield client_1.prisma.orderItemCost.deleteMany({
        where: { orderId }
    });
});
exports.reverseOrderCosts = reverseOrderCosts;
// ==========================================
// 4. FINANCIAL SUMMARY & P&L REPORTING
// ==========================================
const getFinancialSummary = (query) => __awaiter(void 0, void 0, void 0, function* () {
    const { start: startUtc, end: endUtc } = resolveDhakaRange(query.startDate, query.endDate);
    const orders = yield client_1.prisma.order.findMany({
        where: {
            orderTime: { gte: startUtc, lte: endUtc },
            status: { notIn: ['CANCELED'] },
        },
        select: {
            id: true,
            status: true,
            orderSource: true,
            method: true,
            shippingCost: true,
            discountAmount: true,
            shipping: true,
        },
    });
    const returnedOrders = orders.filter((o) => o.status === 'RETURNED');
    const validOrders = orders.filter((o) => o.status !== 'RETURNED');
    const validOrderIds = validOrders.map((o) => o.id);
    const [itemCosts, expenses, stockPurchases] = yield Promise.all([
        client_1.prisma.orderItemCost.findMany({
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
        client_1.prisma.expense.findMany({
            where: { expenseTime: { gte: startUtc, lte: endUtc }, status: 'COMPLETED' },
            select: { amount: true },
        }),
        client_1.prisma.stockPurchase.findMany({
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
    const revenueByOrder = new Map();
    const missingCostOrders = new Set();
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
        if (revenueByOrder.has(o.id))
            totalOrderDiscounts += Number(o.discountAmount) || 0;
    }
    const totalRevenue = grossSales - totalOrderDiscounts; // net revenue
    const grossProfit = totalRevenue - totalCOGS;
    // ---- Fulfillment costs (courier-based orders only; showroom has none) ----
    let returnedCourierLoss = 0;
    let freeShippingCourierCost = 0;
    let codFees = 0;
    let totalShippingCollected = 0;
    for (const o of returnedOrders) {
        if (o.orderSource === 'SHOWROOM')
            continue;
        returnedCourierLoss += (0, exports.resolveCourierCharge)(o);
    }
    for (const o of validOrders) {
        if (o.orderSource === 'SHOWROOM')
            continue;
        totalShippingCollected += Number(o.shippingCost) || 0;
        if (!COURIER_ENGAGED_STATUSES.includes(o.status))
            continue; // not shipped yet
        // Customer-paid shipping offsets the courier fee; free shipping is a real cost to us
        if (!(Number(o.shippingCost) > 0))
            freeShippingCourierCost += (0, exports.resolveCourierCharge)(o);
        if (isCodMethod(o.method)) {
            codFees += Math.round((revenueByOrder.get(o.id) || 0) * COD_FEE_RATE);
        }
    }
    const totalFulfillmentCosts = returnedCourierLoss + freeShippingCourierCost + codFees;
    const totalOperatingExpenses = expenses.reduce((s, e) => s + e.amount, 0);
    const netProfit = grossProfit - totalFulfillmentCosts - totalOperatingExpenses;
    const totalInventoryInvestment = stockPurchases.reduce((s, p) => s + p.totalCost, 0);
    const pct = (v) => (totalRevenue > 0 ? Number(((v / totalRevenue) * 100).toFixed(2)) : 0);
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
            orderCount: validOrders.length, // valid (not canceled / returned)
            returnedCount: returnedOrders.length,
            missingCostItemCount,
            missingCostOrderCount: missingCostOrders.size,
            unsyncedOrderCount: validOrders.filter((o) => !revenueByOrder.has(o.id)).length,
        },
    };
});
exports.getFinancialSummary = getFinancialSummary;
// ==========================================
// 5. HISTORICAL BACKFILL & CORE CALCULATIONS
// ==========================================
const backfillHistoricalOrderCosts = (orderIds) => __awaiter(void 0, void 0, void 0, function* () {
    const whereClause = {
        status: { notIn: ['CANCELED', 'RETURNED'] }
    };
    if (orderIds && orderIds.length > 0) {
        whereClause.id = { in: orderIds };
    }
    else {
        whereClause.OR = [
            { orderItemCosts: { none: {} } },
            { orderItemCosts: { some: { costMissing: true } } },
        ];
    }
    const targetOrders = yield client_1.prisma.order.findMany({
        where: whereClause,
        select: { id: true }
    });
    if (targetOrders.length === 0) {
        return { message: "No matching orders found to sync." };
    }
    let backfilledCount = 0;
    for (const order of targetOrders) {
        yield (0, exports.snapshotOrderCosts)(order.id);
        backfilledCount++;
    }
    return {
        message: `Successfully synced cost snapshots for ${backfilledCount} orders.`
    };
});
// 2. Add manual profit override function
const overrideOrderProfit = (orderId, manualProfit) => __awaiter(void 0, void 0, void 0, function* () {
    // Finds the first cost snapshot or updates total profit for the order
    const costRecord = yield client_1.prisma.orderItemCost.findFirst({
        where: { orderId }
    });
    if (!costRecord) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, "No cost snapshot found for this order to override.");
    }
    return yield client_1.prisma.orderItemCost.update({
        where: { id: costRecord.id },
        data: { profit: manualProfit, totalCost: costRecord.totalRevenue - manualProfit }
    });
});
const calculateOrderFinancials = (order) => {
    var _a;
    const orderStatus = String(order.status || "").toUpperCase();
    const isCanceledOrReturned = orderStatus === "CANCELED" || orderStatus === "RETURNED";
    const isDeliveredOrCompleted = orderStatus === "DELIVERED" || orderStatus === "COMPLETED";
    // 🏷️ Check if it's a Showroom sale (no delivery charges / courier loss)
    const isShowroom = order.orderSource === "SHOWROOM";
    const orderItems = order.orderItems || order.items || order.cartItems || [];
    const shipping = Number(order.shippingCost || 0);
    const itemsSubtotal = orderItems.reduce((acc, it) => acc + (Number(it.price || 0) * Number(it.quantity || it.qty || 1)), 0);
    const productBill = itemsSubtotal > 0 ? itemsSubtotal : Math.max(0, Number(order.amount || 0) - shipping);
    const districtLower = String(((_a = order.shipping) === null || _a === void 0 ? void 0 : _a.district) || "").toLowerCase();
    const isDhaka = districtLower.includes("dhaka");
    const courierDeliveryCharge = isShowroom ? 0 : (shipping > 0 ? shipping : (isDhaka ? 55 : 115));
    const isShippingIncludedInCod = shipping > 0;
    const effectiveDeliveryDeduction = isShowroom || isShippingIncludedInCod ? 0 : courierDeliveryCharge;
    const isCod = !isShowroom && (String(order.method || "").toLowerCase().includes("cash") || String(order.method || "").toLowerCase().includes("cod"));
    const codCharge = isCod ? Math.round(productBill * 0.01) : 0;
    const validBill = !isCanceledOrReturned ? (isShowroom ? Number(order.amount || productBill) : productBill) : 0;
    const isValidOrderCount = !isCanceledOrReturned ? 1 : 0;
    let netReceivable = 0;
    if (isShowroom) {
        // Showroom sales are instant full cash received if paid or completed
        netReceivable = !isCanceledOrReturned ? Number(order.amount || productBill) : 0;
    }
    else if (isDeliveredOrCompleted && order.isPaid === true) {
        netReceivable = Math.max(0, productBill - effectiveDeliveryDeduction - codCharge);
    }
    else if (orderStatus === "RETURNED") {
        netReceivable = -courierDeliveryCharge;
    }
    else {
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
exports.calculateOrderFinancials = calculateOrderFinancials;
const resolveOrderItemCosts = (order) => {
    const status = String(order.status || "").toUpperCase();
    if (status === "CANCELED")
        return [{ profit: 0 }];
    if (status === "RETURNED") {
        const f = (0, exports.calculateOrderFinancials)(order);
        return [{ profit: -f.courierDeliveryCharge }];
    }
    return order.orderItemCosts || [];
};
exports.resolveOrderItemCosts = resolveOrderItemCosts;
const getLedgerTransactions = (query) => __awaiter(void 0, void 0, void 0, function* () {
    let startUtc;
    let endUtc;
    if (query.startDate && query.endDate) {
        startUtc = new Date(query.startDate);
        endUtc = new Date(query.endDate);
        endUtc.setHours(23, 59, 59, 999);
    }
    else {
        const now = new Date();
        startUtc = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        endUtc = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    }
    // 1. Fetch Paid Orders (CREDITS)
    const orders = yield client_1.prisma.order.findMany({
        where: {
            orderTime: { gte: startUtc, lte: endUtc },
            status: { notIn: ['CANCELED', 'RETURNED'] },
            isPaid: true
        },
        select: { id: true, invoice: true, orderTime: true, amount: true, method: true, customer: { select: { name: true } } }
    });
    // 2. Fetch Completed Expenses (DEBITS)
    const expenses = yield client_1.prisma.expense.findMany({
        where: {
            expenseTime: { gte: startUtc, lte: endUtc },
            status: 'COMPLETED',
        },
        select: { id: true, title: true, expenseTime: true, amount: true, method: true, reference: true }
    });
    // 3. Fetch Stock Purchases (DEBITS)
    const purchases = yield client_1.prisma.stockPurchase.findMany({
        where: {
            purchaseDate: { gte: startUtc, lte: endUtc },
        },
        select: { id: true, billNo: true, supplier: true, purchaseDate: true, totalCost: true }
    });
    // Format and combine all entries
    let ledger = [];
    orders.forEach(o => {
        var _a;
        ledger.push({
            id: o.id,
            date: o.orderTime,
            type: 'CREDIT',
            source: 'ORDER',
            description: `Sale #${o.invoice} ${((_a = o.customer) === null || _a === void 0 ? void 0 : _a.name) ? `(${o.customer.name})` : ''}`,
            method: o.method || 'Unknown',
            amount: o.amount,
            reference: o.invoice
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
        if (l.type === 'CREDIT')
            totalCredits += l.amount;
        if (l.type === 'DEBIT')
            totalDebits += l.amount;
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
});
exports.getLedgerTransactions = getLedgerTransactions;
exports.FinanceServices = {
    upsertVariantPackagingCost,
    upsertComboPackagingCost,
    getPackagingCostsBySku,
    addStockPurchaseAndUpdateWAC,
    getProductLiveWAC,
    snapshotOrderCosts: exports.snapshotOrderCosts,
    reverseOrderCosts: exports.reverseOrderCosts,
    getFinancialSummary: exports.getFinancialSummary,
    backfillHistoricalOrderCosts,
    overrideOrderProfit,
    calculateOrderFinancials: exports.calculateOrderFinancials,
    resolveOrderItemCosts: exports.resolveOrderItemCosts,
    getLedgerTransactions: exports.getLedgerTransactions,
};
