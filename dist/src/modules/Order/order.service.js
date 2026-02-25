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
const client_2 = require("@prisma/client"); // ✅ Get All Orders (with customer + salesman info)
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
    if (status)
        where.status = status;
    // ✅ payment filter
    if (payment === "PAID")
        where.isPaid = true;
    if (payment === "DUE")
        where.isPaid = false;
    // ✅ method filter
    if (method)
        where.method = String(method);
    // ✅ date range filter
    if (dateFrom || dateTo) {
        where.orderTime = {};
        if (dateFrom)
            where.orderTime.gte = new Date(String(dateFrom));
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
// ✅ Get Single Order (with full nested details)
const getOrderById = (orderId) => __awaiter(void 0, void 0, void 0, function* () {
    const order = yield client_1.prisma.order.findUnique({
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
    if (!order)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Order not found');
    // Normalize customer info for guest/manual orders
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
    const { customerId, payToken, cartItemIds, amount, isPaid, method, orderSource, saleType, shippingCost, additionalNotes, customerInfo, shippingAddress, billingAddress, coupon, discountAmount, } = payload;
    // 1️⃣ Fetch valid cart items
    const cartItems = yield client_1.prisma.cartItem.findMany({
        where: { id: { in: cartItemIds }, status: 'IN_CART' },
        include: { product: true, variant: true },
    });
    if (cartItems.length === 0) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'No valid cart items found.');
    }
    const subtotal = cartItems.reduce((sum, ci) => sum + Number(ci.price) * Number(ci.quantity), 0);
    const discount = Math.max(0, Number(discountAmount || 0));
    const shipping = Number(shippingCost || 0);
    // final server truth
    const serverAmount = Math.max(0, subtotal - discount) + shipping;
    const normalizeOrGuestEmail = (email) => {
        const e = (email !== null && email !== void 0 ? email : "").trim().toLowerCase();
        if (e)
            return e;
        // unique enough for your use case
        return `guest+${Date.now()}-${Math.random().toString(16).slice(2)}@khushbuwaala.local`;
    };
    // 2️⃣ Start transaction with extended timeout
    const order = yield client_1.prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        const invoice = yield (0, generateInvoice_1.generateInvoice)();
        // Create Order
        const newOrder = yield tx.order.create({
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
                            name: (_a = customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.name) !== null && _a !== void 0 ? _a : "",
                            phone: (_b = customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.phone) !== null && _b !== void 0 ? _b : "",
                            email: normalizeOrGuestEmail(customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.email), // ✅ changed line
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
        // Update CartItems as ordered
        yield tx.cartItem.updateMany({
            where: { id: { in: cartItems.map((i) => i.id) } },
            data: { orderId: newOrder.id, status: 'ORDERED' },
        });
        // Update stock and create logs
        for (const item of cartItems) {
            const variantId = item.variantId;
            const productId = item.productId;
            const qty = item.quantity;
            const variantSize = ((_d = item.variant) === null || _d === void 0 ? void 0 : _d.size) || 0;
            // Update Product stock & salesCount
            yield tx.product.update({
                where: { id: productId },
                data: {
                    salesCount: { increment: qty },
                    stock: { decrement: variantSize * qty },
                },
            });
            // Log stock change
            yield tx.stockLog.create({
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
            yield discount_service_1.DiscountServices.consumeDiscountUsageByCode(tx, coupon, newOrder.id);
        }
        return newOrder;
    }), {
        timeout: 20000, // ✅ 20 seconds instead of default 5s
    });
    // 3️⃣ Fetch full order
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
    // 1) ensure order exists
    const existing = yield client_1.prisma.order.findUnique({ where: { id: orderId } });
    if (!existing)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Order not found');
    // 2) build a SAFE update object (whitelist)
    const data = {};
    // status
    if (payload.status !== undefined)
        data.status = payload.status;
    // payment
    if (payload.isPaid !== undefined) {
        if (typeof payload.isPaid !== 'boolean') {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'isPaid must be boolean');
        }
        data.isPaid = payload.isPaid;
    }
    if (payload.method !== undefined)
        data.method = (_a = payload.method) !== null && _a !== void 0 ? _a : null;
    // source/saleType
    if (payload.orderSource !== undefined)
        data.orderSource = payload.orderSource;
    if (payload.saleType !== undefined)
        data.saleType = payload.saleType;
    // shippingCost / discount / coupon / notes
    if (payload.shippingCost !== undefined)
        data.shippingCost = cleanNumber(payload.shippingCost, 'shippingCost');
    if (payload.discountAmount !== undefined)
        data.discountAmount = Math.max(0, Math.floor(Number(payload.discountAmount)));
    if (payload.coupon !== undefined)
        data.coupon = payload.coupon ? String(payload.coupon).trim().toUpperCase() : null;
    if (payload.additionalNotes !== undefined)
        data.additionalNotes = (_b = payload.additionalNotes) !== null && _b !== void 0 ? _b : null;
    // shipping/billing JSON (replace fully)
    if (payload.shipping !== undefined)
        data.shipping = payload.shipping;
    if (payload.billing !== undefined)
        data.billing = payload.billing;
    // walk-in fields (optional)
    if (payload.name !== undefined)
        data.name = payload.name;
    if (payload.phone !== undefined)
        data.phone = payload.phone;
    if (payload.email !== undefined)
        data.email = payload.email;
    if (payload.address !== undefined)
        data.address = payload.address;
    // amount override (optional)
    if (payload.amount !== undefined) {
        const amt = cleanNumber(payload.amount, 'amount');
        if (amt <= 0)
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'amount must be > 0');
        data.amount = amt;
    }
    // optionally: change customerId (be careful)
    // only allow SUPER_ADMIN / ADMIN to do this
    if (payload.customerId !== undefined) {
        const role = user === null || user === void 0 ? void 0 : user.role;
        if (!['SUPER_ADMIN', 'ADMIN', 'SALESMAN'].includes(role)) {
            throw new AppError_1.default(http_status_1.default.FORBIDDEN, 'Only ADMIN/SUPER_ADMIN/SALESMAN can change customer');
        }
        if (!payload.customerId) {
            data.customerId = null;
        }
        else {
            // connect via relation
            data.customer = { connect: { id: payload.customerId } };
            // also clear walk-in fields if you want:
            // data.name = null; data.phone = null; data.email = null; data.address = null;
        }
    }
    // manual sales
    if (payload.salesmanId !== undefined)
        data.salesman = payload.salesmanId
            ? { connect: { id: payload.salesmanId } }
            : { disconnect: true };
    // 3) must have at least one update
    if (Object.keys(data).length === 0) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'No valid fields provided to update');
    }
    // 4) update
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
    // normalize customer for guest/manual
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
// ✅ Get all orders for a specific user
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
// ✅ Get a single order belonging to logged-in user
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
// ✅ Get all customers who have orders (for admin)
const getAllCustomers = (queryParams) => __awaiter(void 0, void 0, void 0, function* () {
    const queryBuilder = new QueryBuilder_1.PrismaQueryBuilder(queryParams);
    const prismaQuery = queryBuilder.buildSort().buildPagination().getQuery();
    const customers = yield client_1.prisma.user.findMany(Object.assign(Object.assign({}, prismaQuery), { where: {
            customerOrders: {
                some: {}, // fetch users who have at least one order as a customer
            },
        }, select: {
            id: true,
            name: true,
            email: true,
            contact: true,
            address: true,
            imageUrl: true,
            _count: { select: { customerOrders: true } }, // ✅ same here
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
const resolveOrderSourceWhere = (type) => {
    if (type === "website") {
        return { orderSource: client_2.OrderSource.WEBSITE };
    }
    if (type === "manual") {
        return {
            orderSource: {
                in: [client_2.OrderSource.MANUAL, client_2.OrderSource.SHOWROOM, client_2.OrderSource.WHOLESALE], // ✅ mutable array
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
    // Convert Dhaka boundaries -> UTC dates for DB filter
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
};
