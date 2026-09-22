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
exports.OrderServices = void 0;
const client_1 = require("../../../prisma/client");
const AppError_1 = __importDefault(require("../../errors/AppError"));
const http_status_1 = __importDefault(require("http-status"));
const QueryBuilder_1 = require("../../builder/QueryBuilder");
const client_2 = require("@prisma/client");
const generateInvoice_1 = require("../../helpers/generateInvoice");
const discount_service_1 = require("../Discount/discount.service");
const date_fns_1 = require("date-fns");
const date_fns_tz_1 = require("date-fns-tz");
const getAllOrders = (queryParams) => __awaiter(void 0, void 0, void 0, function* () {
    const { searchTerm, status, payment, method, dateFrom, dateTo, productId } = queryParams, rest = __rest(queryParams, ["searchTerm", "status", "payment", "method", "dateFrom", "dateTo", "productId"]);
    const queryBuilder = new QueryBuilder_1.PrismaQueryBuilder(rest, ['id', 'customer.name']);
    const prismaQuery = queryBuilder
        .buildWhere()
        .buildSort()
        .buildPagination()
        .getQuery();
    const where = prismaQuery.where || {};
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
    if (status)
        where.status = status;
    if (payment === "PAID")
        where.isPaid = true;
    if (payment === "DUE")
        where.isPaid = false;
    if (method)
        where.method = String(method);
    if (dateFrom || dateTo) {
        where.orderTime = {};
        if (dateFrom)
            where.orderTime.gte = new Date(String(dateFrom));
        if (dateTo) {
            const end = new Date(String(dateTo));
            end.setHours(23, 59, 59, 999);
            where.orderTime.lte = end;
        }
    }
    if (productId) {
        where.productIds = { has: String(productId) };
    }
    const orders = yield client_1.prisma.order.findMany(Object.assign(Object.assign({}, prismaQuery), { where, include: {
            customer: {
                select: { id: true, name: true, email: true, phone: true, address: true, imageUrl: true },
            },
            orderItems: {
                include: {
                    product: { select: { id: true, name: true, primaryImage: true } },
                    variant: true,
                },
            },
        } }));
    const meta = yield queryBuilder.getPaginationMeta({
        count: (args) => client_1.prisma.order.count({ where: args.where }),
    });
    const normalizedOrders = orders.map((order) => {
        var _a, _b, _c, _d, _e;
        const customerData = (_a = order.customer) !== null && _a !== void 0 ? _a : {
            id: null,
            name: (_b = order.name) !== null && _b !== void 0 ? _b : null,
            phone: (_c = order.phone) !== null && _c !== void 0 ? _c : null,
            email: (_d = order.email) !== null && _d !== void 0 ? _d : null,
            address: (_e = order.address) !== null && _e !== void 0 ? _e : null,
            imageUrl: null,
        };
        return Object.assign(Object.assign({}, order), { customer: customerData });
    });
    return { meta, data: normalizedOrders };
});
const getOrderById = (idOrInvoice) => __awaiter(void 0, void 0, void 0, function* () {
    const param = String(idOrInvoice || "").trim();
    // A MongoDB ObjectId must be exactly 24 hexadecimal characters
    const isMongoId = /^[0-9a-fA-F]{24}$/.test(param);
    const order = yield client_1.prisma.order.findFirst({
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
    if (!order)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Order not found');
    const customerData = order.customer || {
        id: null,
        name: order.name || null,
        phone: order.phone || null,
        email: order.email || null,
        address: order.address || null,
        imageUrl: null,
    };
    return Object.assign(Object.assign({}, order), { customer: customerData });
});
// ✅ Create Order with existing CartItems
const createOrderWithCartItems = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { customerId, payToken, cartItemIds, items, amount, isPaid, method, orderSource, saleType, shippingCost, additionalNotes, customerInfo, shippingAddress, billingAddress, coupon, discountAmount, } = payload;
    // 1️⃣ Fetch valid cart items
    const dbCartItems = yield client_1.prisma.cartItem.findMany({
        where: { id: { in: cartItemIds }, status: 'IN_CART' },
        include: { product: true, variant: true },
    });
    if (dbCartItems.length === 0) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'No valid cart items found.');
    }
    // 2️⃣ Resolve quantities sent by the UI
    const cartItems = dbCartItems.map((ci) => {
        let resolvedQty = ci.quantity;
        if (Array.isArray(items) && items.length > 0) {
            const match = items.find((it) => it.cartItemId && String(it.cartItemId) === String(ci.id)) ||
                items.find((it) => it.productId === ci.productId &&
                    (!ci.variantId || it.variantId === ci.variantId));
            if (match && Number(match.quantity) > 0) {
                resolvedQty = Math.max(1, Math.floor(Number(match.quantity)));
            }
        }
        return Object.assign(Object.assign({}, ci), { quantity: resolvedQty });
    });
    const subtotal = cartItems.reduce((sum, ci) => sum + Number(ci.price) * Number(ci.quantity), 0);
    const discount = Math.max(0, Number(discountAmount || 0));
    const shipping = Number(shippingCost || 0);
    const serverAmount = Math.max(0, subtotal - discount) + shipping;
    const normalizeOrGuestEmail = (email) => {
        const e = (email !== null && email !== void 0 ? email : "").trim().toLowerCase();
        if (e)
            return e;
        return `guest+${Date.now()}-${Math.random().toString(16).slice(2)}@khushbuwaala.local`;
    };
    // 3️⃣ SAFE EMAIL CHECK: Prevent `users_email_unique_string` duplicate key errors
    const rawEmail = ((_a = customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.email) !== null && _a !== void 0 ? _a : "").trim().toLowerCase();
    let resolvedCustomerId = customerId || null;
    if (!resolvedCustomerId && rawEmail) {
        const existingUser = yield client_1.prisma.user.findFirst({
            where: { email: rawEmail },
            select: { id: true },
        });
        if (existingUser) {
            resolvedCustomerId = existingUser.id;
        }
    }
    // 4️⃣ Start transaction
    const order = yield client_1.prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        const invoice = yield (0, generateInvoice_1.generateInvoice)();
        const newOrder = yield tx.order.create({
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
                            name: (_a = customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.name) !== null && _a !== void 0 ? _a : "",
                            phone: (_b = customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.phone) !== null && _b !== void 0 ? _b : "",
                            email: normalizeOrGuestEmail(customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.email),
                            address: (_c = customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.address) !== null && _c !== void 0 ? _c : "",
                        },
                    },
                shipping: {
                    name: (shippingAddress === null || shippingAddress === void 0 ? void 0 : shippingAddress.name) || (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.name) || null,
                    phone: (shippingAddress === null || shippingAddress === void 0 ? void 0 : shippingAddress.phone) || (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.phone) || null,
                    email: (shippingAddress === null || shippingAddress === void 0 ? void 0 : shippingAddress.email) || (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.email) || null,
                    address: (shippingAddress === null || shippingAddress === void 0 ? void 0 : shippingAddress.address) || (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.address) || null,
                    district: (shippingAddress === null || shippingAddress === void 0 ? void 0 : shippingAddress.district) || (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.district) || null,
                    thana: (shippingAddress === null || shippingAddress === void 0 ? void 0 : shippingAddress.thana) || (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.thana) || null,
                },
                billing: {
                    name: (billingAddress === null || billingAddress === void 0 ? void 0 : billingAddress.name) || (shippingAddress === null || shippingAddress === void 0 ? void 0 : shippingAddress.name) || (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.name) || null,
                    phone: (billingAddress === null || billingAddress === void 0 ? void 0 : billingAddress.phone) || (shippingAddress === null || shippingAddress === void 0 ? void 0 : shippingAddress.phone) || (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.phone) || null,
                    email: (billingAddress === null || billingAddress === void 0 ? void 0 : billingAddress.email) || (shippingAddress === null || shippingAddress === void 0 ? void 0 : shippingAddress.email) || (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.email) || null,
                    address: (billingAddress === null || billingAddress === void 0 ? void 0 : billingAddress.address) || (shippingAddress === null || shippingAddress === void 0 ? void 0 : shippingAddress.address) || (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.address) || null,
                    district: (billingAddress === null || billingAddress === void 0 ? void 0 : billingAddress.district) || (shippingAddress === null || shippingAddress === void 0 ? void 0 : shippingAddress.district) || (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.district) || null,
                    thana: (billingAddress === null || billingAddress === void 0 ? void 0 : billingAddress.thana) || (shippingAddress === null || shippingAddress === void 0 ? void 0 : shippingAddress.thana) || (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.thana) || null,
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
        yield Promise.all(cartItems.map((item) => tx.cartItem.update({
            where: { id: item.id },
            data: {
                orderId: newOrder.id,
                status: 'ORDERED',
                quantity: item.quantity,
                price: Number(item.price),
            },
        })));
        // Update stock and create logs using resolved quantity
        for (const item of cartItems) {
            const variantId = item.variantId;
            const productId = item.productId;
            const qty = item.quantity;
            const variantSize = ((_d = item.variant) === null || _d === void 0 ? void 0 : _d.size) || 0;
            yield tx.product.update({
                where: { id: productId },
                data: {
                    salesCount: { increment: qty },
                    stock: { decrement: variantSize * qty },
                },
            });
            yield tx.stockLog.create({
                data: {
                    productId,
                    variantId: variantId || '',
                    change: -(variantSize * qty),
                    reason: 'SALE',
                },
            });
        }
        if (coupon && method === "cashOnDelivery") {
            yield discount_service_1.DiscountServices.consumeDiscountUsageByCode(tx, coupon, newOrder.id);
        }
        return newOrder;
    }), {
        timeout: 20000,
    });
    // 5️⃣ Fetch full order
    const fullOrder = yield client_1.prisma.order.findUnique({
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
    if (!fullOrder)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Order not found');
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
const updateOrderStatus = (orderId, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const order = yield client_1.prisma.order.update({
        where: { id: orderId },
        data: payload,
    });
    return order;
});
const updatePaymentStatus = (orderId, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const isPaid = payload === null || payload === void 0 ? void 0 : payload.isPaid;
    if (typeof isPaid !== 'boolean') {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'isPaid must be boolean');
    }
    const order = yield client_1.prisma.order.update({
        where: { id: orderId },
        data: { isPaid },
    });
    return order;
});
const cleanNumber = (v, field) => {
    if (v === undefined)
        return undefined;
    const n = Number(v);
    if (!Number.isFinite(n))
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, `${field} must be a number`);
    return n;
};
const updateOrder = (orderId, payload, user) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const existing = yield client_1.prisma.order.findUnique({ where: { id: orderId } });
    if (!existing)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Order not found');
    const data = {};
    if (payload.status !== undefined)
        data.status = payload.status;
    if (payload.isPaid !== undefined) {
        if (typeof payload.isPaid !== 'boolean') {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'isPaid must be boolean');
        }
        data.isPaid = payload.isPaid;
    }
    if (payload.method !== undefined)
        data.method = (_a = payload.method) !== null && _a !== void 0 ? _a : null;
    if (payload.orderSource !== undefined)
        data.orderSource = payload.orderSource;
    if (payload.saleType !== undefined)
        data.saleType = payload.saleType;
    if (payload.shippingCost !== undefined)
        data.shippingCost = cleanNumber(payload.shippingCost, 'shippingCost');
    if (payload.discountAmount !== undefined)
        data.discountAmount = Math.max(0, Math.floor(Number(payload.discountAmount)));
    if (payload.coupon !== undefined)
        data.coupon = payload.coupon ? String(payload.coupon).trim().toUpperCase() : null;
    if (payload.additionalNotes !== undefined)
        data.additionalNotes = (_b = payload.additionalNotes) !== null && _b !== void 0 ? _b : null;
    if (payload.shipping !== undefined)
        data.shipping = payload.shipping;
    if (payload.billing !== undefined)
        data.billing = payload.billing;
    if (payload.name !== undefined)
        data.name = payload.name;
    if (payload.phone !== undefined)
        data.phone = payload.phone;
    if (payload.email !== undefined)
        data.email = payload.email;
    if (payload.address !== undefined)
        data.address = payload.address;
    if (payload.amount !== undefined) {
        const amt = cleanNumber(payload.amount, 'amount');
        if (amt <= 0)
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'amount must be > 0');
        data.amount = amt;
    }
    if (payload.customerId !== undefined) {
        const role = user === null || user === void 0 ? void 0 : user.role;
        if (!['SUPER_ADMIN', 'ADMIN', 'SALESMAN'].includes(role)) {
            throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'Only ADMIN/SUPER_ADMIN/SALESMAN can change customer');
        }
        if (!payload.customerId) {
            data.customerId = null;
        }
        else {
            data.customer = { connect: { id: payload.customerId } };
        }
    }
    if (payload.salesmanId !== undefined)
        data.salesman = payload.salesmanId
            ? { connect: { id: payload.salesmanId } }
            : { disconnect: true };
    if (Object.keys(data).length === 0) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'No valid fields provided to update');
    }
    const updated = yield client_1.prisma.order.update({
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
    return Object.assign(Object.assign({}, updated), { customer: customerData });
});
const getUserOrders = (userId, queryParams) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const queryBuilder = new QueryBuilder_1.PrismaQueryBuilder(queryParams);
    const prismaQuery = queryBuilder.buildSort().buildPagination().getQuery();
    const where = { customerId: userId };
    const [orders, totalOrders, totalAmount] = yield Promise.all([
        client_1.prisma.order.findMany(Object.assign(Object.assign({}, prismaQuery), { where, include: {
                orderItems: {
                    include: {
                        product: { select: { id: true, name: true, primaryImage: true } },
                        variant: true,
                    },
                },
            } })),
        client_1.prisma.order.count({ where }),
        client_1.prisma.order.aggregate({ where, _sum: { amount: true } }),
    ]);
    const meta = yield queryBuilder.getPaginationMeta({
        count: (args) => client_1.prisma.order.count({ where: args.where }),
    });
    return {
        meta,
        totalOrders,
        totalAmount: (_a = totalAmount._sum.amount) !== null && _a !== void 0 ? _a : 0,
        data: orders,
    };
});
const getMyOrders = (userId, queryParams) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const queryBuilder = new QueryBuilder_1.PrismaQueryBuilder(queryParams);
    const prismaQuery = queryBuilder.buildSort().buildPagination().getQuery();
    const where = { customerId: userId };
    const [orders, totalOrders, totalAmount] = yield Promise.all([
        client_1.prisma.order.findMany(Object.assign(Object.assign({}, prismaQuery), { where, include: {
                orderItems: {
                    include: {
                        product: { select: { id: true, name: true, primaryImage: true } },
                        variant: true,
                    },
                },
            } })),
        client_1.prisma.order.count({ where }),
        client_1.prisma.order.aggregate({ where, _sum: { amount: true } }),
    ]);
    const meta = yield queryBuilder.getPaginationMeta({
        count: (args) => client_1.prisma.order.count({ where: args.where }),
    });
    return {
        meta,
        totalOrders,
        totalAmount: (_a = totalAmount._sum.amount) !== null && _a !== void 0 ? _a : 0,
        data: orders,
    };
});
const getMyOrder = (userId, orderId) => __awaiter(void 0, void 0, void 0, function* () {
    const order = yield client_1.prisma.order.findFirst({
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
    if (!order)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Order not found');
    return order;
});
const getAllCustomers = (queryParams) => __awaiter(void 0, void 0, void 0, function* () {
    const queryBuilder = new QueryBuilder_1.PrismaQueryBuilder(queryParams);
    const prismaQuery = queryBuilder.buildSort().buildPagination().getQuery();
    const customers = yield client_1.prisma.user.findMany(Object.assign(Object.assign({}, prismaQuery), { where: {
            customerOrders: {
                some: {},
            },
        }, select: {
            id: true,
            name: true,
            email: true,
            contact: true,
            address: true,
            imageUrl: true,
            _count: { select: { customerOrders: true } },
        } }));
    const meta = yield queryBuilder.getPaginationMeta({
        count: (args) => client_1.prisma.user.count({
            where: {
                customerOrders: { some: {} },
            },
        }),
    });
    return { meta, data: customers };
});
const resolveOrderSourceWhere = (type) => {
    if (type === "website") {
        return { orderSource: client_2.OrderSource.WEBSITE };
    }
    if (type === "manual") {
        return {
            orderSource: {
                in: [client_2.OrderSource.MANUAL, client_2.OrderSource.SHOWROOM, client_2.OrderSource.WHOLESALE],
            },
        };
    }
    return {};
};
const buildLast7Days = () => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const d = (0, date_fns_1.subDays)(new Date(), i);
        const label = d.toLocaleDateString("en-US", { weekday: "short" });
        const key = d.toISOString().slice(0, 10);
        days.push({ key, label, date: d });
    }
    return days;
};
const TZ = "Asia/Dhaka";
const getDashboardMetrics = (...args_1) => __awaiter(void 0, [...args_1], void 0, function* (type = "all") {
    var _a, _b;
    const nowUtc = new Date();
    const nowDhaka = (0, date_fns_tz_1.toZonedTime)(nowUtc, TZ);
    const todayStartDhaka = (0, date_fns_1.startOfDay)(nowDhaka);
    const todayEndDhaka = (0, date_fns_1.endOfDay)(nowDhaka);
    const monthStartDhaka = (0, date_fns_1.startOfMonth)(nowDhaka);
    const todayStart = (0, date_fns_tz_1.fromZonedTime)(todayStartDhaka, TZ);
    const todayEnd = (0, date_fns_tz_1.fromZonedTime)(todayEndDhaka, TZ);
    const monthStart = (0, date_fns_tz_1.fromZonedTime)(monthStartDhaka, TZ);
    const sourceWhere = resolveOrderSourceWhere(type);
    const baseOrdersWhere = Object.assign(Object.assign({}, sourceWhere), { status: { not: "CANCELED" } });
    const baseSalesWhere = Object.assign(Object.assign({}, sourceWhere), { status: { not: "CANCELED" }, isPaid: true });
    const [todayOrders, monthOrders, monthSalesAgg, totalSalesAgg] = yield Promise.all([
        client_1.prisma.order.count({
            where: Object.assign(Object.assign({}, baseOrdersWhere), { orderTime: { gte: todayStart, lte: todayEnd } }),
        }),
        client_1.prisma.order.count({
            where: Object.assign(Object.assign({}, baseOrdersWhere), { orderTime: { gte: monthStart } }),
        }),
        client_1.prisma.order.aggregate({
            where: Object.assign(Object.assign({}, baseSalesWhere), { orderTime: { gte: monthStart } }),
            _sum: { amount: true },
        }),
        client_1.prisma.order.aggregate({
            where: baseSalesWhere,
            _sum: { amount: true },
        }),
    ]);
    return {
        type,
        todayOrders,
        monthOrders,
        monthSales: Number((_a = monthSalesAgg._sum.amount) !== null && _a !== void 0 ? _a : 0),
        totalSales: Number((_b = totalSalesAgg._sum.amount) !== null && _b !== void 0 ? _b : 0),
    };
});
const getWeeklySalesOverview = (...args_1) => __awaiter(void 0, [...args_1], void 0, function* (type = "all") {
    var _a;
    const last7 = buildLast7Days();
    const fromDhakaStart = (0, date_fns_1.startOfDay)(last7[0].date);
    const fromUtc = (0, date_fns_tz_1.fromZonedTime)(fromDhakaStart, TZ);
    const sourceWhere = resolveOrderSourceWhere(type);
    const orders = yield client_1.prisma.order.findMany({
        where: Object.assign(Object.assign({}, sourceWhere), { orderTime: { gte: fromUtc }, status: { not: "CANCELED" } }),
        select: {
            orderTime: true,
            amount: true,
            isPaid: true,
        },
    });
    const buckets = {};
    for (const d of last7)
        buckets[d.key] = { sales: 0, orders: 0 };
    for (const o of orders) {
        const oDhaka = (0, date_fns_tz_1.toZonedTime)(o.orderTime, TZ);
        const key = (0, date_fns_1.format)(oDhaka, "yyyy-MM-dd");
        if (!buckets[key])
            continue;
        buckets[key].orders += 1;
        if (o.isPaid)
            buckets[key].sales += Number((_a = o.amount) !== null && _a !== void 0 ? _a : 0);
    }
    return last7.map((d) => {
        var _a, _b, _c, _d;
        return ({
            day: d.label,
            sales: (_b = (_a = buckets[d.key]) === null || _a === void 0 ? void 0 : _a.sales) !== null && _b !== void 0 ? _b : 0,
            orders: (_d = (_c = buckets[d.key]) === null || _c === void 0 ? void 0 : _c.orders) !== null && _d !== void 0 ? _d : 0,
        });
    });
});
const trackOrders = (queryParam) => __awaiter(void 0, void 0, void 0, function* () {
    const param = String(queryParam || "").trim();
    if (!param)
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, "Search query is required");
    const cleanDigits = param.replace(/\D/g, "");
    const isMongoId = /^[0-9a-fA-F]{24}$/.test(param);
    // 1️⃣ Build MongoDB raw filter to search root fields AND nested JSON fields (shipping/billing)
    const rawOrConditions = [
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
        rawOrConditions.push({ phone: { $regex: cleanDigits, $options: "i" } }, { "shipping.phone": { $regex: cleanDigits, $options: "i" } }, { "billing.phone": { $regex: cleanDigits, $options: "i" } });
    }
    // Find matching Order IDs using MongoDB's native JSON traversal
    const matchedOrdersRaw = (yield client_1.prisma.order.findRaw({
        filter: {
            $or: rawOrConditions,
        },
        options: {
            projection: { _id: 1 },
        },
    }));
    // Extract the matching 24-char hex ObjectIDs
    const matchedIds = (matchedOrdersRaw || [])
        .map((doc) => (typeof doc._id === "object" ? doc._id.$oid : doc._id))
        .filter(Boolean);
    if (matchedIds.length === 0) {
        return [];
    }
    // 2️⃣ Fetch the full relations (orderItems, products, variants, customer)
    const orders = yield client_1.prisma.order.findMany({
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
        const shippingJson = order.shipping || {};
        const billingJson = order.billing || {};
        const customerObj = order.customer || {};
        const resolvedName = shippingJson.name ||
            customerObj.name ||
            order.name ||
            "Valued Customer";
        const resolvedPhone = shippingJson.phone ||
            customerObj.phone ||
            order.phone ||
            "";
        const resolvedEmail = shippingJson.email ||
            customerObj.email ||
            order.email ||
            "";
        const resolvedAddress = shippingJson.address ||
            customerObj.address ||
            order.address ||
            "";
        return Object.assign(Object.assign({}, order), { name: resolvedName, phone: resolvedPhone, email: resolvedEmail, address: resolvedAddress, customer: {
                id: customerObj.id || null,
                name: resolvedName,
                phone: resolvedPhone,
                email: resolvedEmail,
                imageUrl: customerObj.imageUrl || null,
            } });
    });
});
exports.OrderServices = {
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
