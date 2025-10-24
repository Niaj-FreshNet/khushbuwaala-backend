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
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderServices = void 0;
const QueryBuilder_1 = require("../../builder/QueryBuilder");
const client_1 = require("../../../prisma/client");
const getAllOrders = (queryParams) => __awaiter(void 0, void 0, void 0, function* () {
    const { searchTerm, status } = queryParams, rest = __rest(queryParams, ["searchTerm", "status"]);
    const queryBuilder = new QueryBuilder_1.PrismaQueryBuilder(rest, ['title', 'content']);
    const prismaQuery = queryBuilder
        .buildWhere()
        .buildSort()
        .buildPagination()
        .buildSelect()
        .getQuery();
    // Build the complete where clause with all conditions
    const where = prismaQuery.where || {};
    // Add searchTerm filter for customer name
    if (searchTerm) {
        where.OR = [
            ...(where.OR || []),
            {
                customer: {
                    name: {
                        contains: String(searchTerm),
                        mode: 'insensitive',
                    },
                },
            },
        ];
    }
    // Add status filter
    if (status) {
        where.status = status;
    }
    // Execute the main query
    const result = yield client_1.prisma.order.findMany(Object.assign(Object.assign({}, prismaQuery), { where, include: {
            customer: {
                select: {
                    id: true,
                    name: true,
                    imageUrl: true,
                },
            },
        } }));
    // Get pagination metadata with the same where clause
    const meta = yield queryBuilder.getPaginationMeta({
        count: (args) => client_1.prisma.order.count({
            where: Object.assign(Object.assign({}, args.where), where),
        }),
    });
    return {
        meta,
        data: result,
    };
});
// Get Order details
const getOrderById = (orderId) => __awaiter(void 0, void 0, void 0, function* () {
    // Step 1: Get the order (with cartItems as JSON)
    const order = yield client_1.prisma.order.findUnique({
        where: {
            id: orderId,
        },
        include: {
            customer: {
                select: {
                    id: true,
                    name: true,
                    imageUrl: true,
                },
            },
        },
    });
    if (!order)
        return null;
    // Step 2: Extract productIds from cartItems
    const cartItems = order.cartItems;
    const productIds = cartItems.map((item) => item.productId);
    // Step 3: Fetch product details
    const products = yield client_1.prisma.product.findMany({
        where: {
            id: { in: productIds },
        },
        select: {
            id: true,
            name: true,
            primaryImage: true,
        },
    });
    // Step 4: Combine cartItems with product info
    const detailedCartItems = cartItems.map((item) => {
        const product = products.find((p) => p.id === item.productId);
        return Object.assign(Object.assign({}, item), { product });
    });
    // Step 5: Return enriched order
    return Object.assign(Object.assign({}, order), { cartItems: detailedCartItems });
});
// Get user's orders BY ID
const getUserOrders = (id, queryParams) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    // Extract searchTerm and rest params
    const { searchTerm } = queryParams, rest = __rest(queryParams, ["searchTerm"]);
    // Build base query without searchTerm filters
    const queryBuilder = new QueryBuilder_1.PrismaQueryBuilder(rest);
    const prismaQuery = queryBuilder
        .buildSort()
        .buildPagination()
        .buildSelect()
        .getQuery();
    // Base where filter by customer
    const where = {
        customerId: id,
    };
    // If there's a search term, we need to handle it specially for JSON fields
    if (searchTerm &&
        typeof searchTerm === 'string' &&
        searchTerm.trim() !== '') {
        const s = searchTerm.trim();
        // Define valid OrderStatus enum values
        const validOrderStatuses = [
            'PENDING',
            'PROCESSING',
            'SHIPPED',
            'DELIVERED',
            'CANCELLED',
        ];
        // Build OR conditions for searchable string fields
        const orConditions = [
            { id: { contains: s, mode: 'insensitive' } },
            { method: { contains: s, mode: 'insensitive' } },
            { address: { contains: s, mode: 'insensitive' } },
            { email: { contains: s, mode: 'insensitive' } },
        ];
        // Add status search if the search term matches a valid enum value
        const matchingStatus = validOrderStatuses.find((status) => status.toLowerCase() === s.toLowerCase());
        if (matchingStatus) {
            orConditions.push({ status: { equals: matchingStatus } });
        }
        // For searching in cartItems, we'll need to do it post-query
        // First, get all orders for this customer
        const allOrders = yield client_1.prisma.order.findMany({
            where: { customerId: id },
            include: {
                customer: {
                    select: {
                        id: true,
                        name: true,
                        imageUrl: true,
                    },
                },
            },
            orderBy: prismaQuery.orderBy,
        });
        // Filter orders that match the search term
        const filteredOrders = allOrders.filter((order) => {
            // Check string fields
            const stringFieldsMatch = order.id.toLowerCase().includes(s.toLowerCase()) ||
                // order.method.toLowerCase().includes(s.toLowerCase()) ||
                // order.address.toLowerCase().includes(s.toLowerCase()) ||
                // order.email.toLowerCase().includes(s.toLowerCase()) ||
                (matchingStatus && order.status === matchingStatus);
            // Check if search term matches any product name in cartItems
            const cartItemsMatch = Array.isArray(order.cartItems) &&
                order.cartItems.some((item) => item.productName &&
                    item.productName.toLowerCase().includes(s.toLowerCase()));
            return stringFieldsMatch || cartItemsMatch;
        });
        // Apply pagination manually
        const skip = prismaQuery.skip || 0;
        const take = prismaQuery.take || 10;
        const paginatedOrders = filteredOrders.slice(skip, skip + take);
        // Calculate totals for filtered results
        const totalOrders = filteredOrders.length;
        const totalAmount = filteredOrders.reduce((sum, order) => sum + order.amount, 0);
        // Calculate pagination meta
        const totalPages = Math.ceil(totalOrders / take);
        const currentPage = Math.floor(skip / take) + 1;
        return {
            meta: {
                total: totalOrders,
                totalPage: totalPages,
                page: currentPage,
                limit: take,
            },
            totalOrders,
            totalAmount,
            data: paginatedOrders,
        };
    }
    // If no search term, use the regular database query
    const orders = yield client_1.prisma.order.findMany(Object.assign(Object.assign({}, prismaQuery), { where, include: {
            customer: {
                select: {
                    id: true,
                    name: true,
                    imageUrl: true,
                },
            },
        } }));
    // Get total count and total amount matching filters
    const [totalOrders, totalAmount] = yield Promise.all([
        client_1.prisma.order.count({ where }),
        client_1.prisma.order.aggregate({
            where,
            _sum: {
                amount: true,
            },
        }),
    ]);
    // Get pagination meta using PrismaQueryBuilder helper
    const meta = yield queryBuilder.getPaginationMeta({
        count: (args) => client_1.prisma.order.count(Object.assign(Object.assign({}, args), { where })),
    });
    return {
        meta,
        totalOrders,
        totalAmount: (_a = totalAmount._sum.amount) !== null && _a !== void 0 ? _a : 0,
        data: orders,
    };
});
const updateOrderStatus = (orderId, payload) => __awaiter(void 0, void 0, void 0, function* () {
    yield client_1.prisma.order.update({
        where: {
            id: orderId,
        },
        data: payload,
    });
    return true;
});
const getMyOrders = (userId, queryParams) => __awaiter(void 0, void 0, void 0, function* () {
    // Extend query builder with searchable order ID
    const queryBuilder = new QueryBuilder_1.PrismaQueryBuilder(queryParams, ['id']);
    // Build full query (where + sort + pagination)
    const prismaQuery = queryBuilder
        .buildWhere()
        .buildSort()
        .buildPagination()
        .getQuery();
    // Inject user-based filter (customerId)
    prismaQuery.where = Object.assign(Object.assign({}, prismaQuery.where), { customerId: userId });
    // Include customer details
    prismaQuery.include = {
        customer: {
            select: {
                id: true,
                name: true,
                imageUrl: true,
            },
        },
    };
    // Execute main query
    const orders = yield client_1.prisma.order.findMany(prismaQuery);
    // Get pagination meta
    const meta = yield queryBuilder.getPaginationMeta(client_1.prisma.order);
    return {
        meta,
        data: orders,
    };
});
const getMyOrder = (userId, orderId) => __awaiter(void 0, void 0, void 0, function* () {
    // Step 1: Get the order (with cartItems as JSON)
    const order = yield client_1.prisma.order.findUnique({
        where: {
            id: orderId,
            customerId: userId,
        },
        include: {
            customer: {
                select: {
                    id: true,
                    name: true,
                    imageUrl: true,
                },
            },
        },
    });
    if (!order)
        return null;
    // Step 2: Extract productIds from cartItems
    const cartItems = order.cartItems;
    const productIds = cartItems.map((item) => item.productId);
    // Step 3: Fetch product details
    const products = yield client_1.prisma.product.findMany({
        where: {
            id: { in: productIds },
        },
        select: {
            id: true,
            name: true,
            primaryImage: true,
        },
    });
    // Step 4: Combine cartItems with product info
    const detailedCartItems = cartItems.map((item) => {
        const product = products.find((p) => p.id === item.productId);
        return Object.assign(Object.assign({}, item), { product });
    });
    // Step 5: Return enriched order
    return Object.assign(Object.assign({}, order), { cartItems: detailedCartItems });
});
const getAllCustomers = (queryParams) => __awaiter(void 0, void 0, void 0, function* () {
    const searchableFields = ['name'];
    const queryBuilder = new QueryBuilder_1.PrismaQueryBuilder(queryParams, searchableFields)
        .buildWhere()
        .buildSort()
        .buildPagination()
        .buildSelect();
    const prismaQuery = queryBuilder.getQuery();
    // Inject fixed condition: users who placed at least one order
    prismaQuery.where = Object.assign(Object.assign({}, prismaQuery.where), { role: 'USER', Order: {
            some: {},
        } });
    // Add default selection if not provided
    if (!prismaQuery.select) {
        prismaQuery.select = {
            id: true,
            name: true,
            email: true,
            contact: true,
            address: true,
            imageUrl: true,
            createdAt: true,
        };
    }
    const customers = yield client_1.prisma.user.findMany(prismaQuery);
    const meta = yield queryBuilder.getPaginationMeta(client_1.prisma.user);
    return {
        meta,
        data: customers,
    };
});
exports.OrderServices = {
    getAllOrders,
    getOrderById,
    getUserOrders,
    updateOrderStatus,
    getMyOrders,
    getMyOrder,
    getAllCustomers,
};
