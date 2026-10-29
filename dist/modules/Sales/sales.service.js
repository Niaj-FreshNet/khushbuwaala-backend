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
// src/app/modules/sales/sales.service.ts
const QueryBuilder_1 = require("../../builder/QueryBuilder");
const client_1 = require("../../../prisma/client");
const client_2 = require("@prisma/client");
const http_status_1 = __importDefault(require("http-status"));
const AppError_1 = __importDefault(require("../../errors/AppError"));
const generateInvoice_1 = require("../../helpers/generateInvoice");
// Treat “sales” as orders with a non-WEBSITE orderSource
const MANUAL_SOURCES = [
    client_2.OrderSource.SHOWROOM,
    client_2.OrderSource.WHOLESALE,
    client_2.OrderSource.MANUAL,
];
// -------------------------------
// Create a manual sale (Order)
// -------------------------------
const createSale = (payload, userId) => __awaiter(void 0, void 0, void 0, function* () {
    const { customerId, salesmanId, saleType, cartItemIds, amount, isPaid, method, orderSource, customerInfo, } = payload;
    console.log(payload, userId);
    // 1️⃣ Fetch valid cart items
    const cartItems = yield client_1.prisma.cartItem.findMany({
        where: { id: { in: cartItemIds }, status: 'IN_CART' },
        include: { product: true, variant: true },
    });
    if (cartItems.length === 0) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'No valid cart items found.');
    }
    // 2️⃣ Generate invoice
    const invoice = yield (0, generateInvoice_1.generateInvoice)();
    // 3️⃣ Transaction: create order + link cart items only
    const newOrder = yield client_1.prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
        const created = yield tx.order.create({
            data: {
                invoice,
                customerId: customerId || null,
                salesmanId: userId || null,
                saleType: saleType || client_2.SaleType.SINGLE,
                amount: Number(amount),
                isPaid: isPaid || false,
                method: method || null,
                orderSource: orderSource || client_2.OrderSource.WEBSITE,
                name: (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.name) || null,
                phone: (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.phone) || null,
                email: (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.email) || null,
                address: (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.address) || null,
                productIds: cartItems.map((ci) => ci.productId),
                cartItems: cartItems.map((item) => ({
                    productId: item.productId,
                    variantId: item.variantId,
                    size: item.size || null,
                    unit: item.unit || null,
                    quantity: item.quantity,
                    price: item.price,
                })),
            },
        });
        // Update cart items status → ORDERED
        yield tx.cartItem.updateMany({
            where: { id: { in: cartItemIds } },
            data: { orderId: created.id, status: 'ORDERED' },
        });
        return created;
    }), { timeout: 15000 } // ⏳ Allow up to 15 seconds to avoid premature timeout
    );
    // 4️⃣ Outside transaction: stock updates + stock logs
    yield Promise.all(cartItems.map((item) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        const variantId = item.variantId;
        const productId = item.productId;
        const qty = item.quantity;
        const variantSize = ((_a = item.variant) === null || _a === void 0 ? void 0 : _a.size) || 0;
        try {
            // Optional: update product variant stock
            if (variantId) {
                yield client_1.prisma.productVariant.update({
                    where: { id: variantId },
                    data: {}, // optional if no stock tracking in variants
                });
            }
            // Update product stock and salesCount
            yield client_1.prisma.product.update({
                where: { id: productId },
                data: {
                    salesCount: { increment: qty },
                    stock: { decrement: variantSize * qty },
                },
            });
            // Log stock movement
            yield client_1.prisma.stockLog.create({
                data: {
                    productId,
                    variantId: variantId || '',
                    change: -(variantSize * qty),
                    reason: 'SALE',
                },
            });
        }
        catch (err) {
            console.error('⚠️ Stock update failed for product:', productId, err);
        }
    })));
    // 5️⃣ Fetch full order with relations
    const fullOrder = yield client_1.prisma.order.findUnique({
        where: { id: newOrder.id },
        include: {
            customer: { select: { id: true, name: true, imageUrl: true } },
            salesman: { select: { id: true, name: true, imageUrl: true } },
        },
    });
    if (!fullOrder)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Order not found after creation.');
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
// Admin: get all manual sales
// -------------------------------
const getAllSales = (queryParams) => __awaiter(void 0, void 0, void 0, function* () {
    const _a = queryParams, { searchTerm, status, source } = _a, rest = __rest(_a, ["searchTerm", "status", "source"]);
    const queryBuilder = new QueryBuilder_1.PrismaQueryBuilder(rest);
    const prismaQuery = queryBuilder
        .buildWhere()
        .buildSort()
        .buildPagination()
        .getQuery();
    const where = Object.assign(Object.assign({}, prismaQuery.where), (source
        ? { orderSource: source }
        : { orderSource: { in: MANUAL_SOURCES } }));
    if (status)
        where.status = status;
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
    const data = yield client_1.prisma.order.findMany(Object.assign(Object.assign({}, prismaQuery), { where, include: {
            salesman: { select: { id: true, name: true, imageUrl: true, email: true } },
        } }));
    const meta = yield queryBuilder.getPaginationMeta({
        count: (args) => { var _a; return client_1.prisma.order.count({ where: Object.assign(Object.assign({}, where), ((_a = args === null || args === void 0 ? void 0 : args.where) !== null && _a !== void 0 ? _a : {})) }); },
    });
    return { meta, data };
});
// -------------------------------
// Salesman: my sales
// -------------------------------
const getMySales = (salesmanId, queryParams) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const _b = queryParams, { searchTerm, status, source } = _b, rest = __rest(_b, ["searchTerm", "status", "source"]);
    const queryBuilder = new QueryBuilder_1.PrismaQueryBuilder(rest);
    const prismaQuery = queryBuilder
        .buildWhere()
        .buildSort()
        .buildPagination()
        .getQuery();
    const where = Object.assign(Object.assign(Object.assign({}, prismaQuery.where), { salesmanId }), (source
        ? { orderSource: source }
        : { orderSource: { in: MANUAL_SOURCES } }));
    if (status)
        where.status = status;
    if (searchTerm && searchTerm.trim()) {
        const s = searchTerm.trim();
        where.OR = [
            { name: { contains: s, mode: 'insensitive' } },
            { phone: { contains: s, mode: 'insensitive' } },
            { address: { contains: s, mode: 'insensitive' } },
        ];
    }
    const data = yield client_1.prisma.order.findMany(Object.assign(Object.assign({}, prismaQuery), { where, include: {
            salesman: { select: { id: true, name: true, imageUrl: true, email: true } },
        } }));
    const [count, sum] = yield Promise.all([
        client_1.prisma.order.count({ where }),
        client_1.prisma.order.aggregate({ where, _sum: { amount: true } }),
    ]);
    const meta = yield queryBuilder.getPaginationMeta({
        count: (args) => { var _a; return client_1.prisma.order.count({ where: Object.assign(Object.assign({}, where), ((_a = args === null || args === void 0 ? void 0 : args.where) !== null && _a !== void 0 ? _a : {})) }); },
    });
    return {
        meta,
        totalSales: count,
        totalAmount: (_a = sum._sum.amount) !== null && _a !== void 0 ? _a : 0,
        data,
    };
});
// -------------------------------
// Admin: sales by customer phone
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
        } }));
    const meta = yield queryBuilder.getPaginationMeta({
        count: (args) => { var _a; return client_1.prisma.order.count({ where: Object.assign(Object.assign({}, where), ((_a = args === null || args === void 0 ? void 0 : args.where) !== null && _a !== void 0 ? _a : {})) }); },
    });
    return { meta, data };
});
// -------------------------------
/** Update sale status / payment */
const updateSaleStatus = (id, payload) => __awaiter(void 0, void 0, void 0, function* () {
    // Only allow valid enum if provided
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
        },
    });
    return updated;
});
// -------------------------------
// Admin: sales analytics
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
// (Optional) Single sale fetch if you still need it anywhere
const getSaleById = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const sale = yield client_1.prisma.order.findUnique({
        where: { id },
        include: {
            salesman: { select: { id: true, name: true, imageUrl: true, email: true } },
        },
    });
    return sale;
});
exports.SaleServices = {
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
