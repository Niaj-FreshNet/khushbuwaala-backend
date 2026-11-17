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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SaleServices = void 0;
const QueryBuilder_1 = require("../../builder/QueryBuilder");
const client_1 = require("../../../prisma/client");
const client_2 = require("@prisma/client");
const http_status_1 = __importDefault(require("http-status"));
const AppError_1 = __importDefault(require("../../errors/AppError"));
const generateInvoice_1 = require("../../helpers/generateInvoice");
const finance_service_1 = require("../Finance/finance.service");
// Treat “sales” as orders with a non-WEBSITE orderSource
const MANUAL_SOURCES = [
    client_2.OrderSource.SHOWROOM,
    client_2.OrderSource.WHOLESALE,
    client_2.OrderSource.MANUAL,
];
const INACTIVE_STATUSES = ['CANCELED', 'RETURNED'];
// Re-create the cost snapshot when a sale is edited or re-activated.
// Canceled/returned sales are never snapshotted (their profit is resolved at read time).
const refreshCostSnapshotIfNeeded = (orderId, status, force) => __awaiter(void 0, void 0, void 0, function* () {
    if (INACTIVE_STATUSES.includes(String(status || '').toUpperCase()))
        return;
    const needsSnapshot = force || (yield client_1.prisma.orderItemCost.count({ where: { orderId } })) === 0;
    if (!needsSnapshot)
        return;
    try {
        yield (0, finance_service_1.snapshotOrderCosts)(orderId);
    }
    catch (err) {
        console.error('❌ Failed to refresh sale cost snapshot:', err);
    }
});
// -------------------------------
// Create a manual sale (Order)
// -------------------------------
const createSale = (payload, userId) => __awaiter(void 0, void 0, void 0, function* () {
    const { customerId, salesmanId, saleType, cartItemIds, items, amount, isPaid, method, orderSource, platform, platformNote, shippingCost, discountAmount, additionalNotes, customerInfo, } = payload;
    // 1️⃣ Fetch valid cart items
    const dbCartItems = yield client_1.prisma.cartItem.findMany({
        where: { id: { in: cartItemIds }, status: 'IN_CART' },
        include: { product: true, variant: true },
    });
    if (dbCartItems.length === 0) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'No valid cart items found.');
    }
    // 2️⃣ Resolve quantities and prices from payload or DB fallback.
    // Every resolved item is tied to exactly ONE real cart item (no duplicates).
    const usedIds = new Set();
    const cartItems = items && items.length > 0 ? items.map((it) => {
        var _a, _b, _c, _d, _e, _f, _g;
        const dbItem = (_a = dbCartItems.find((ci) => it.cartItemId && String(ci.id) === String(it.cartItemId))) !== null && _a !== void 0 ? _a : dbCartItems.find((ci) => !usedIds.has(ci.id) &&
            ci.productId === it.productId &&
            (!it.variantId || ci.variantId === it.variantId));
        if (!dbItem) {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, `Cart item for product ${it.productId || it.cartItemId || ''} was not found or is no longer in the cart.`);
        }
        usedIds.add(dbItem.id);
        const resolvedQty = Math.max(1, Math.floor(Number(it.quantity || dbItem.quantity || 1)));
        const resolvedPrice = Number((_c = (_b = it.price) !== null && _b !== void 0 ? _b : dbItem.price) !== null && _c !== void 0 ? _c : 0);
        const resolvedOriginalPrice = Number((_e = (_d = it.originalPrice) !== null && _d !== void 0 ? _d : dbItem.originalPrice) !== null && _e !== void 0 ? _e : resolvedPrice);
        const unitDiscount = Math.max(0, resolvedOriginalPrice - resolvedPrice);
        return {
            id: dbItem.id,
            productId: String(it.productId || dbItem.productId || ''),
            variantId: it.variantId || dbItem.variantId || null,
            size: dbItem.size || ((_f = dbItem.variant) === null || _f === void 0 ? void 0 : _f.size) || null,
            unit: dbItem.unit || ((_g = dbItem.variant) === null || _g === void 0 ? void 0 : _g.unit) || null,
            quantity: resolvedQty,
            price: resolvedPrice,
            originalPrice: resolvedOriginalPrice,
            discount: unitDiscount,
            product: dbItem.product,
            variant: dbItem.variant,
        };
    }) : dbCartItems.map((ci) => {
        var _a, _b, _c, _d;
        return ({
            id: ci.id,
            productId: ci.productId,
            variantId: ci.variantId,
            size: ci.size || ((_a = ci.variant) === null || _a === void 0 ? void 0 : _a.size) || null,
            unit: ci.unit || ((_b = ci.variant) === null || _b === void 0 ? void 0 : _b.unit) || null,
            quantity: ci.quantity,
            price: Number(ci.price),
            originalPrice: Number((_c = ci.originalPrice) !== null && _c !== void 0 ? _c : ci.price),
            discount: Math.max(0, Number((_d = ci.originalPrice) !== null && _d !== void 0 ? _d : ci.price) - Number(ci.price)),
            product: ci.product,
            variant: ci.variant,
        });
    });
    const subtotal = cartItems.reduce((sum, ci) => sum + Number(ci.price) * Number(ci.quantity), 0);
    const shipping = Number(shippingCost || 0);
    const serverAmount = amount ? Number(amount) : Math.max(0, subtotal) + shipping;
    const invoice = yield (0, generateInvoice_1.generateInvoice)();
    const safeProductIds = [...new Set(cartItems.map((ci) => ci.productId).filter(Boolean))];
    // 3️⃣ Transaction: create order + link the EXISTING cart items & update inventory
    const newOrder = yield client_1.prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
        const created = yield tx.order.create({
            data: {
                invoice,
                customerId: customerId || null,
                salesmanId: userId || salesmanId || null,
                saleType: saleType || client_2.SaleType.SINGLE,
                amount: serverAmount,
                shippingCost: shipping,
                discountAmount: Number(discountAmount || 0),
                isPaid: isPaid || false,
                method: method || 'cash',
                orderSource: orderSource || client_2.OrderSource.SHOWROOM,
                platform: platform || platformNote || '',
                additionalNotes: additionalNotes || '',
                name: (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.name) || null,
                phone: (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.phone) || null,
                email: (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.email) || null,
                address: (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.address) || null,
                shipping: {
                    name: (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.name) || null,
                    phone: (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.phone) || null,
                    email: (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.email) || null,
                    address: (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.address) || null,
                    district: (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.district) || null,
                    thana: (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.thana) || null,
                },
                billing: {
                    name: (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.name) || null,
                    phone: (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.phone) || null,
                    email: (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.email) || null,
                    address: (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.address) || null,
                    district: (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.district) || null,
                    thana: (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.thana) || null,
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
        // Attach the existing cart items to the order with the final qty/price
        yield Promise.all(cartItems.map((item) => tx.cartItem.update({
            where: { id: item.id },
            data: {
                orderId: created.id,
                status: 'ORDERED',
                quantity: item.quantity,
                price: Number(item.price),
                originalPrice: Number(item.originalPrice),
                discount: Number(item.discount),
            },
        })));
        // Stock updates & stock logs
        yield Promise.all([
            ...cartItems.map((item) => {
                var _a;
                const variantSize = ((_a = item.variant) === null || _a === void 0 ? void 0 : _a.size) || 0;
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
                var _a;
                const variantSize = ((_a = item.variant) === null || _a === void 0 ? void 0 : _a.size) || 0;
                const qty = item.quantity;
                return tx.stockLog.create({
                    data: {
                        productId: item.productId,
                        variantId: item.variantId || '',
                        change: -(variantSize * qty),
                        reason: 'SALE',
                    },
                });
            }),
        ]);
        return created;
    }), { timeout: 15000 });
    // 4️⃣ Snapshot costs for finance reporting (after commit, so items are final)
    try {
        yield (0, finance_service_1.snapshotOrderCosts)(newOrder.id);
    }
    catch (err) {
        console.error('❌ Failed to snapshot manual sale item costs:', err);
    }
    // 5️⃣ Fetch full order with full relations matching order backends
    const fullOrder = yield client_1.prisma.order.findUnique({
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
    if (!fullOrder)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Sale not found after creation.');
    const customerData = fullOrder.customer || {
        id: null,
        name: fullOrder.name || null,
        phone: fullOrder.phone || null,
        email: fullOrder.email || null,
        address: fullOrder.address || null,
        imageUrl: null,
    };
    return Object.assign(Object.assign({}, fullOrder), { customer: customerData });
});
// -------------------------------
// Admin: Get all manual sales with summary logic
// -------------------------------
const getAllSales = (queryParams, user) => __awaiter(void 0, void 0, void 0, function* () {
    const _a = queryParams, { searchTerm, status, payment, method, source, platform, dateFrom, dateTo, productId } = _a, rest = __rest(_a, ["searchTerm", "status", "payment", "method", "source", "platform", "dateFrom", "dateTo", "productId"]);
    const queryBuilder = new QueryBuilder_1.PrismaQueryBuilder(rest, ['id', 'customer.name']);
    const prismaQuery = queryBuilder
        .buildWhere()
        .buildSort()
        .buildPagination()
        .getQuery();
    const where = Object.assign(Object.assign({}, prismaQuery.where), (source ? { orderSource: source } : { orderSource: { in: MANUAL_SOURCES } }));
    if (status && status !== 'ALL')
        where.status = status;
    if (payment === 'PAID')
        where.isPaid = true;
    if (payment === 'DUE')
        where.isPaid = false;
    if (method && method !== 'ALL')
        where.method = String(method);
    if (platform && platform !== 'ALL') {
        where.platform = { equals: platform, mode: 'insensitive' };
    }
    if (dateFrom || dateTo) {
        where.orderTime = {};
        if (dateFrom)
            where.orderTime.gte = new Date(dateFrom);
        if (dateTo) {
            const end = new Date(dateTo);
            end.setHours(23, 59, 59, 999);
            where.orderTime.lte = end;
        }
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
    const isSuperAdmin = (user === null || user === void 0 ? void 0 : user.role) === 'SUPER_ADMIN';
    const orderIncludeConfig = {
        customer: { select: { id: true, name: true, email: true, phone: true, address: true, imageUrl: true } },
        salesman: { select: { id: true, name: true, imageUrl: true, email: true } },
        orderItems: {
            include: {
                product: { select: { id: true, name: true, primaryImage: true } },
                variant: true,
            },
        },
    };
    // ✅ Fetch both paginated data AND unpaginated dataset using the exact same `where` filters for accurate summaries
    const [orders, allFilteredSales, meta] = yield Promise.all([
        client_1.prisma.order.findMany(Object.assign(Object.assign({}, prismaQuery), { where, include: orderIncludeConfig })),
        client_1.prisma.order.findMany({
            where,
            include: { orderItems: true },
        }),
        queryBuilder.getPaginationMeta({
            count: (args) => client_1.prisma.order.count({ where }),
        }),
    ]);
    if (isSuperAdmin && orders.length > 0) {
        const orderIds = orders.map((o) => o.id);
        const allItemCosts = yield client_1.prisma.orderItemCost.findMany({
            where: { orderId: { in: orderIds } },
        });
        orders.forEach((order) => {
            const uniqueCostsMap = new Map();
            allItemCosts
                .filter((c) => c.orderId === order.id)
                .forEach((c) => {
                uniqueCostsMap.set(c.cartItemId || c.id, c);
            });
            order.orderItemCosts = Array.from(uniqueCostsMap.values());
        });
    }
    // ── Professional Summary Metrics Calculation ──
    let totalCount = allFilteredSales.length;
    let totalValidCount = 0;
    let totalCodAmount = 0;
    let totalBillAmount = 0;
    let totalRcvAmount = 0;
    let paidCount = 0;
    let dueCount = 0;
    allFilteredSales.forEach((order) => {
        const financials = finance_service_1.FinanceServices.calculateOrderFinancials(order);
        if (!financials.isCanceledOrReturned) {
            totalValidCount += Number(financials.isValidOrderCount);
            totalCodAmount += Number(order.amount);
            totalBillAmount += Number(financials.productBill);
            if (financials.isPaid)
                paidCount++;
            else
                dueCount++;
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
        return Object.assign(Object.assign(Object.assign({}, order), { customer: customerData }), (isSuperAdmin ? { orderItemCosts: finance_service_1.FinanceServices.resolveOrderItemCosts(order) } : {}));
    });
    return { meta, summary, data: normalizedSales };
});
// -------------------------------
// Salesman: My Sales
// -------------------------------
const getMySales = (salesmanId, queryParams) => __awaiter(void 0, void 0, void 0, function* () {
    const _a = queryParams, { searchTerm, status, source } = _a, rest = __rest(_a, ["searchTerm", "status", "source"]);
    const queryBuilder = new QueryBuilder_1.PrismaQueryBuilder(rest);
    const prismaQuery = queryBuilder
        .buildWhere()
        .buildSort()
        .buildPagination()
        .getQuery();
    const where = Object.assign(Object.assign(Object.assign({}, prismaQuery.where), { salesmanId }), (source ? { orderSource: source } : { orderSource: { in: MANUAL_SOURCES } }));
    if (status)
        where.status = status;
    if (searchTerm && searchTerm.trim()) {
        const s = searchTerm.trim();
        where.OR = [
            { invoice: { contains: s, mode: 'insensitive' } },
            { name: { contains: s, mode: 'insensitive' } },
            { phone: { contains: s, mode: 'insensitive' } },
            { address: { contains: s, mode: 'insensitive' } },
        ];
    }
    const [data, allFilteredMySales, meta] = yield Promise.all([
        client_1.prisma.order.findMany(Object.assign(Object.assign({}, prismaQuery), { where, include: {
                salesman: { select: { id: true, name: true, imageUrl: true, email: true } },
                orderItems: {
                    include: {
                        product: { select: { id: true, name: true, primaryImage: true } },
                        variant: true,
                    },
                },
            } })),
        client_1.prisma.order.findMany({ where }),
        queryBuilder.getPaginationMeta({
            count: (args) => { var _a; return client_1.prisma.order.count({ where: Object.assign(Object.assign({}, where), ((_a = args === null || args === void 0 ? void 0 : args.where) !== null && _a !== void 0 ? _a : {})) }); },
        }),
    ]);
    let totalSalesCount = allFilteredMySales.length;
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
});
// -------------------------------
// Get Sale By ID (with Super Admin Cost inclusion)
// -------------------------------
const getSaleById = (id, user) => __awaiter(void 0, void 0, void 0, function* () {
    const isSuperAdmin = (user === null || user === void 0 ? void 0 : user.role) === 'SUPER_ADMIN';
    const sale = yield client_1.prisma.order.findUnique({
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
    if (!sale)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Sale not found');
    if (isSuperAdmin) {
        const itemCosts = yield client_1.prisma.orderItemCost.findMany({
            where: { orderId: sale.id },
        });
        sale.orderItemCosts = finance_service_1.FinanceServices.resolveOrderItemCosts(Object.assign(Object.assign({}, sale), { orderItemCosts: itemCosts }));
    }
    const customerData = sale.customer || {
        id: null,
        name: sale.name || null,
        phone: sale.phone || null,
        email: sale.email || null,
        address: sale.address || null,
        imageUrl: null,
    };
    return Object.assign(Object.assign({}, sale), { customer: customerData });
});
// -------------------------------
// Get Sales by Customer Phone
// -------------------------------
const getSalesByCustomer = (phone, queryParams) => __awaiter(void 0, void 0, void 0, function* () {
    const queryBuilder = new QueryBuilder_1.PrismaQueryBuilder(queryParams);
    const prismaQuery = queryBuilder.buildSort().buildPagination().getQuery();
    const where = {
        phone: { contains: phone, mode: 'insensitive' },
        orderSource: { in: MANUAL_SOURCES },
    };
    const data = yield client_1.prisma.order.findMany(Object.assign(Object.assign({}, prismaQuery), { where, include: {
            salesman: { select: { id: true, name: true, imageUrl: true, email: true } },
            orderItems: {
                include: {
                    product: { select: { id: true, name: true, primaryImage: true } },
                    variant: true,
                },
            },
        } }));
    const meta = yield queryBuilder.getPaginationMeta({
        count: (args) => { var _a; return client_1.prisma.order.count({ where: Object.assign(Object.assign({}, where), ((_a = args === null || args === void 0 ? void 0 : args.where) !== null && _a !== void 0 ? _a : {})) }); },
    });
    return { meta, data };
});
// -------------------------------
// Update Sale Status
// -------------------------------
const updateSaleStatus = (id, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const data = {};
    if (payload.status)
        data.status = payload.status;
    if (typeof payload.isPaid === 'boolean')
        data.isPaid = payload.isPaid;
    const updated = yield client_1.prisma.order.update({
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
    // Re-activated sale (e.g. CANCELED -> PENDING) with no snapshot → rebuild it
    yield refreshCostSnapshotIfNeeded(id, String(updated.status), false);
    return updated;
});
// -------------------------------
// Full Sale Update (Matches updateOrder)
// -------------------------------
const updateSale = (orderId, payload, user) => __awaiter(void 0, void 0, void 0, function* () {
    const existing = yield client_1.prisma.order.findUnique({
        where: { id: orderId },
        include: { orderItems: true },
    });
    if (!existing)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Sale not found');
    const updated = yield client_1.prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b;
        const data = {};
        if (payload.status !== undefined)
            data.status = payload.status;
        if (payload.isPaid !== undefined)
            data.isPaid = payload.isPaid;
        if (payload.method !== undefined)
            data.method = (_a = payload.method) !== null && _a !== void 0 ? _a : null;
        if (payload.orderSource !== undefined)
            data.orderSource = payload.orderSource;
        if (payload.platform !== undefined)
            data.platform = payload.platform;
        if (payload.shippingCost !== undefined)
            data.shippingCost = Number(payload.shippingCost);
        if (payload.discountAmount !== undefined)
            data.discountAmount = Math.max(0, Number(payload.discountAmount));
        if (payload.additionalNotes !== undefined)
            data.additionalNotes = (_b = payload.additionalNotes) !== null && _b !== void 0 ? _b : null;
        if (payload.amount !== undefined)
            data.amount = Number(payload.amount);
        if (payload.name !== undefined)
            data.name = payload.name;
        if (payload.phone !== undefined)
            data.phone = payload.phone;
        if (payload.email !== undefined)
            data.email = payload.email;
        if (payload.address !== undefined)
            data.address = payload.address;
        if (payload.salesmanId !== undefined) {
            data.salesman = payload.salesmanId ? { connect: { id: payload.salesmanId } } : { disconnect: true };
        }
        if (payload.orderItems && Array.isArray(payload.orderItems)) {
            const incomingItems = payload.orderItems;
            const existingItems = existing.orderItems;
            const incomingItemIds = incomingItems.map((i) => i.id).filter((id) => id && !id.startsWith('temp_'));
            const itemsToDelete = existingItems.filter((item) => !incomingItemIds.includes(item.id));
            if (itemsToDelete.length > 0) {
                yield tx.cartItem.deleteMany({
                    where: { id: { in: itemsToDelete.map((i) => i.id) } },
                });
            }
            const safeProductIds = [];
            yield Promise.all(incomingItems.map((item) => __awaiter(void 0, void 0, void 0, function* () {
                if (item.productId)
                    safeProductIds.push(item.productId);
                const itemPayload = {
                    productId: item.productId,
                    variantId: item.variantId || null,
                    size: Number(item.size || 0),
                    unit: item.unit || 'ML',
                    quantity: Math.max(1, Number(item.quantity || 1)),
                    price: Number(item.price || 0),
                    status: 'ORDERED',
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
                return tx.cartItem.create({
                    data: Object.assign(Object.assign({}, itemPayload), { orderId: existing.id }),
                });
            })));
            data.productIds = [...new Set(safeProductIds)];
        }
        return yield tx.order.update({
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
    }), { timeout: 15000 });
    // Items edited → rebuild snapshot. Re-activated with no snapshot → rebuild too.
    yield refreshCostSnapshotIfNeeded(orderId, String(updated.status), Array.isArray(payload.orderItems));
    return updated;
});
// -------------------------------
// Delete Sale API
// -------------------------------
const deleteSale = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const existing = yield client_1.prisma.order.findUnique({
        where: { id },
        include: { orderItems: true },
    });
    if (!existing) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Sale not found');
    }
    const result = yield client_1.prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
        // Delete associated CartItems
        yield tx.cartItem.deleteMany({
            where: { orderId: id },
        });
        // Delete cost snapshots so no orphan rows remain
        yield tx.orderItemCost.deleteMany({
            where: { orderId: id },
        });
        // Delete the order
        const deletedOrder = yield tx.order.delete({
            where: { id },
        });
        return deletedOrder;
    }));
    return result;
});
// -------------------------------
// Admin: Sales Analytics
// -------------------------------
const getSalesAnalytics = (queryParams) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { startDate, endDate, salesmanId } = queryParams;
    const where = {
        orderSource: { in: MANUAL_SOURCES },
    };
    if (salesmanId)
        where.salesmanId = salesmanId;
    if (startDate || endDate) {
        where.createdAt = {};
        if (startDate)
            where.createdAt.gte = new Date(startDate);
        if (endDate)
            where.createdAt.lte = new Date(endDate);
    }
    const [count, sum, byStatus, bySource] = yield Promise.all([
        client_1.prisma.order.count({ where }),
        client_1.prisma.order.aggregate({ where, _sum: { amount: true } }),
        client_1.prisma.order.groupBy({
            by: ['status'],
            _count: { _all: true },
            _sum: { amount: true },
            where,
        }),
        client_1.prisma.order.groupBy({
            by: ['orderSource'],
            _count: { _all: true },
            _sum: { amount: true },
            where,
        }),
    ]);
    return {
        totalSales: count,
        totalAmount: (_a = sum._sum.amount) !== null && _a !== void 0 ? _a : 0,
        byStatus,
        bySource,
    };
});
exports.SaleServices = {
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
