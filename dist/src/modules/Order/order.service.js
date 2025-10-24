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
const getAllOrders = (queryParams) => __awaiter(void 0, void 0, void 0, function* () {
    const { searchTerm, status } = queryParams, rest = __rest(queryParams, ["searchTerm", "status"]);
    const queryBuilder = new QueryBuilder_1.PrismaQueryBuilder(rest, ['id', 'customer.name']);
    const prismaQuery = queryBuilder
        .buildWhere()
        .buildSort()
        .buildPagination()
        .getQuery();
    const where = prismaQuery.where || {};
    if (searchTerm) {
        where.OR = [
            ...(where.OR || []),
            { name: { contains: String(searchTerm), mode: 'insensitive' } },
            { email: { contains: String(searchTerm), mode: 'insensitive' } },
            { phone: { contains: String(searchTerm), mode: 'insensitive' } },
        ];
    }
    if (status)
        where.status = status;
    // ✅ Explicitly type the result to include customer
    const orders = yield client_1.prisma.order.findMany(Object.assign(Object.assign({}, prismaQuery), { where, include: {
            customer: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    address: true,
                    imageUrl: true,
                },
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
    // Normalize customer info for guest orders
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
    const { customerId, cartItemIds, amount, isPaid, orderSource, customerInfo } = payload;
    // 1️⃣ Fetch valid cart items
    const cartItems = yield client_1.prisma.cartItem.findMany({
        where: { id: { in: cartItemIds }, status: 'IN_CART' },
        include: { product: true, variant: true },
    });
    if (cartItems.length === 0) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'No valid cart items found.');
    }
    // 2️⃣ Start transaction with extended timeout
    const order = yield client_1.prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        // Create Order
        const newOrder = yield tx.order.create({
            data: {
                customerId: customerId || null,
                amount: Number(amount),
                isPaid: isPaid || false,
                orderSource: orderSource || 'WEBSITE',
                name: (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.name) || null,
                phone: (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.phone) || null,
                email: (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.email) || null,
                address: (customerInfo === null || customerInfo === void 0 ? void 0 : customerInfo.address) || null,
                cartItems: cartItems.map((item) => ({
                    productId: item.productId,
                    variantId: item.variantId,
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
            const variantSize = ((_a = item.variant) === null || _a === void 0 ? void 0 : _a.size) || 0;
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
exports.OrderServices = {
    getAllOrders,
    getOrderById,
    createOrderWithCartItems,
    updateOrderStatus,
    getUserOrders,
    getMyOrders,
    getMyOrder,
    getAllCustomers
};
