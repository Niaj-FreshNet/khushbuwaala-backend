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
exports.SaleServices = void 0;
const QueryBuilder_1 = require("../../builder/QueryBuilder");
const client_1 = require("../../../prisma/client");
const addSale = (payload, userId) => __awaiter(void 0, void 0, void 0, function* () {
    const { cartItems, amount, method, isPaid, name, phone, address, status, reference, } = payload;
    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
        throw new Error('Cart items are required');
    }
    // Optionally, you may validate product existence here
    const result = yield client_1.prisma.sale.create({
        data: {
            cartItems, // assumes JSON array of { productId, quantity, ... }
            amount,
            method,
            isPaid,
            name,
            phone,
            address,
            status,
            reference,
            salesmanId: userId,
        },
    });
    return result;
});
const getAllSales = (queryParams) => __awaiter(void 0, void 0, void 0, function* () {
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
    // Add searchTerm filter for salesman name
    if (searchTerm) {
        where.OR = [
            ...(where.OR || []),
            {
                salesman: {
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
    const result = yield client_1.prisma.sale.findMany(Object.assign(Object.assign({}, prismaQuery), { where, include: {
            salesman: {
                select: {
                    id: true,
                    name: true,
                    imageUrl: true,
                },
            },
        } }));
    // Get pagination metadata with the same where clause
    const meta = yield queryBuilder.getPaginationMeta({
        count: (args) => client_1.prisma.sale.count({
            where: Object.assign(Object.assign({}, args.where), where),
        }),
    });
    return {
        meta,
        data: result,
    };
});
// Get Sale details
const getSaleById = (saleId) => __awaiter(void 0, void 0, void 0, function* () {
    // Step 1: Get the sale (with cartItems as JSON)
    const sale = yield client_1.prisma.sale.findUnique({
        where: {
            id: saleId,
        },
        include: {
            salesman: {
                select: {
                    id: true,
                    name: true,
                    imageUrl: true,
                },
            },
        },
    });
    if (!sale)
        return null;
    // Step 2: Extract productIds from cartItems
    const cartItems = sale.cartItems;
    const productIds = cartItems.map((item) => item.productId);
    // Step 3: Fetch product details
    const products = yield client_1.prisma.product.findMany({
        where: {
            id: { in: productIds },
        },
        select: {
            id: true,
            name: true,
            imageUrl: true,
        },
    });
    // Step 4: Combine cartItems with product info
    const detailedCartItems = cartItems.map((item) => {
        const product = products.find((p) => p.id === item.productId);
        return Object.assign(Object.assign({}, item), { product });
    });
    // Step 5: Return enriched sale
    return Object.assign(Object.assign({}, sale), { cartItems: detailedCartItems });
});
// Get user's sales BY ID
const getUserSales = (id, queryParams) => __awaiter(void 0, void 0, void 0, function* () {
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
    // Base where filter by salesman
    const where = {
        salesmanId: id,
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
            'COMPLETED',
            'CANCELED',
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
        // First, get all sales for this salesman
        const allSales = yield client_1.prisma.sale.findMany({
            where: { salesmanId: id },
            include: {
                salesman: {
                    select: {
                        id: true,
                        name: true,
                        imageUrl: true,
                    },
                },
            },
            orderBy: prismaQuery.orderBy,
        });
        // Filter sales that match the search term
        const filteredSales = allSales.filter((sale) => {
            // Check string fields
            const stringFieldsMatch = sale.id.toLowerCase().includes(s.toLowerCase()) ||
                sale.method.toLowerCase().includes(s.toLowerCase()) ||
                // sale.address.toLowerCase().includes(s.toLowerCase()) ||
                (matchingStatus && sale.status === matchingStatus);
            // Check if search term matches any product name in cartItems
            const cartItemsMatch = Array.isArray(sale.cartItems) &&
                sale.cartItems.some((item) => item.productName &&
                    item.productName.toLowerCase().includes(s.toLowerCase()));
            return stringFieldsMatch || cartItemsMatch;
        });
        // Apply pagination manually
        const skip = prismaQuery.skip || 0;
        const take = prismaQuery.take || 10;
        const paginatedSales = filteredSales.slice(skip, skip + take);
        // Calculate totals for filtered results
        const totalSales = filteredSales.length;
        const totalAmount = filteredSales.reduce((sum, sale) => sum + sale.amount, 0);
        // Calculate pagination meta
        const totalPages = Math.ceil(totalSales / take);
        const currentPage = Math.floor(skip / take) + 1;
        return {
            meta: {
                total: totalSales,
                totalPage: totalPages,
                page: currentPage,
                limit: take,
            },
            totalSales,
            totalAmount,
            data: paginatedSales,
        };
    }
    // If no search term, use the regular database query
    const sales = yield client_1.prisma.sale.findMany(Object.assign(Object.assign({}, prismaQuery), { where, include: {
            salesman: {
                select: {
                    id: true,
                    name: true,
                    imageUrl: true,
                },
            },
        } }));
    // Get total count and total amount matching filters
    const [totalSales, totalAmount] = yield Promise.all([
        client_1.prisma.sale.count({ where }),
        client_1.prisma.sale.aggregate({
            where,
            _sum: {
                amount: true,
            },
        }),
    ]);
    // Get pagination meta using PrismaQueryBuilder helper
    const meta = yield queryBuilder.getPaginationMeta({
        count: (args) => client_1.prisma.sale.count(Object.assign(Object.assign({}, args), { where })),
    });
    return {
        meta,
        totalSales,
        totalAmount: (_a = totalAmount._sum.amount) !== null && _a !== void 0 ? _a : 0,
        data: sales,
    };
});
const updateSaleStatus = (saleId, payload) => __awaiter(void 0, void 0, void 0, function* () {
    yield client_1.prisma.sale.update({
        where: {
            id: saleId,
        },
        data: payload,
    });
    return true;
});
const getMySales = (userId, queryParams) => __awaiter(void 0, void 0, void 0, function* () {
    // Extend query builder with searchable sale ID
    const queryBuilder = new QueryBuilder_1.PrismaQueryBuilder(queryParams, ['id']);
    // Build full query (where + sort + pagination)
    const prismaQuery = queryBuilder
        .buildWhere()
        .buildSort()
        .buildPagination()
        .getQuery();
    // Inject user-based filter (salesmanId)
    prismaQuery.where = Object.assign(Object.assign({}, prismaQuery.where), { salesmanId: userId });
    // Include salesman details
    prismaQuery.include = {
        salesman: {
            select: {
                id: true,
                name: true,
                imageUrl: true,
            },
        },
    };
    // Execute main query
    const sales = yield client_1.prisma.sale.findMany(prismaQuery);
    // Get pagination meta
    const meta = yield queryBuilder.getPaginationMeta(client_1.prisma.sale);
    return {
        meta,
        data: sales,
    };
});
const getMySaleById = (userId, saleId) => __awaiter(void 0, void 0, void 0, function* () {
    // Step 1: Get the sale (with cartItems as JSON)
    const sale = yield client_1.prisma.sale.findUnique({
        where: {
            id: saleId,
            salesmanId: userId,
        },
        include: {
            salesman: {
                select: {
                    id: true,
                    name: true,
                    imageUrl: true,
                },
            },
        },
    });
    if (!sale)
        return null;
    // Step 2: Extract productIds from cartItems
    const cartItems = sale.cartItems;
    const productIds = cartItems.map((item) => item.productId);
    // Step 3: Fetch product details
    const products = yield client_1.prisma.product.findMany({
        where: {
            id: { in: productIds },
        },
        select: {
            id: true,
            name: true,
            imageUrl: true,
        },
    });
    // Step 4: Combine cartItems with product info
    const detailedCartItems = cartItems.map((item) => {
        const product = products.find((p) => p.id === item.productId);
        return Object.assign(Object.assign({}, item), { product });
    });
    // Step 5: Return enriched sale
    return Object.assign(Object.assign({}, sale), { cartItems: detailedCartItems });
});
const getAllSalesman = (queryParams) => __awaiter(void 0, void 0, void 0, function* () {
    const searchableFields = ['name'];
    const queryBuilder = new QueryBuilder_1.PrismaQueryBuilder(queryParams, searchableFields)
        .buildWhere()
        .buildSort()
        .buildPagination()
        .buildSelect();
    const prismaQuery = queryBuilder.getQuery();
    // Inject fixed condition: users who placed at least one sale
    prismaQuery.where = Object.assign(Object.assign({}, prismaQuery.where), { role: 'SALESMAN', Order: {
            some: {},
        } });
    // Add default selection if not provided
    if (!prismaQuery.select) {
        prismaQuery.select = {
            id: true,
            name: true,
            email: true,
            // contact: true,
            // address: true,
            // imageUrl: true,
            // createdAt: true,
        };
    }
    const salesmans = yield client_1.prisma.user.findMany(prismaQuery);
    const meta = yield queryBuilder.getPaginationMeta(client_1.prisma.user);
    return {
        meta,
        data: salesmans,
    };
});
exports.SaleServices = {
    addSale,
    getAllSales,
    getSaleById,
    getUserSales,
    updateSaleStatus,
    getMySales,
    getMySaleById,
    getAllSalesman,
};
