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
exports.ExpenseServices = void 0;
const QueryBuilder_1 = require("../../builder/QueryBuilder");
const client_1 = require("../../../prisma/client");
const http_status_1 = __importDefault(require("http-status"));
const AppError_1 = __importDefault(require("../../errors/AppError"));
const createExpense = (payload, userId) => __awaiter(void 0, void 0, void 0, function* () {
    const { expenseTime, title, description, amount, method, isPaid, status, reference } = payload;
    const expense = yield client_1.prisma.expense.create({
        data: {
            expenseTime: new Date(expenseTime),
            title,
            description: description || '',
            amount: Number(amount),
            method,
            isPaid: isPaid !== null && isPaid !== void 0 ? isPaid : false,
            status: status || 'PENDING',
            reference: reference || '',
            expenseById: userId,
        },
        include: {
            expenseBy: { select: { id: true, name: true } },
        },
    });
    return expense;
});
const getAllExpenses = (queryParams) => __awaiter(void 0, void 0, void 0, function* () {
    const _a = queryParams, { searchTerm, status, isPaid, method, dateFrom, dateTo } = _a, rest = __rest(_a, ["searchTerm", "status", "isPaid", "method", "dateFrom", "dateTo"]);
    const queryBuilder = new QueryBuilder_1.PrismaQueryBuilder(rest);
    const prismaQuery = queryBuilder
        .buildWhere()
        .buildSort()
        .buildPagination()
        .getQuery();
    const where = Object.assign({}, prismaQuery.where);
    // Exact Match Filters
    if (status && status !== 'ALL') {
        where.status = status;
    }
    if (method && method !== 'ALL') {
        where.method = method;
    }
    if (isPaid !== undefined && isPaid !== 'ALL') {
        where.isPaid = isPaid === 'true' || isPaid === true;
    }
    // Financial Period Alignment
    if (dateFrom || dateTo) {
        where.expenseTime = {};
        if (dateFrom) {
            where.expenseTime.gte = new Date(dateFrom);
        }
        if (dateTo) {
            const endDateTime = new Date(dateTo);
            endDateTime.setHours(23, 59, 59, 999);
            where.expenseTime.lte = endDateTime;
        }
    }
    // Fuzzy Search
    if (searchTerm && searchTerm.trim()) {
        const s = searchTerm.trim();
        where.OR = [
            { title: { contains: s, mode: 'insensitive' } },
            { description: { contains: s, mode: 'insensitive' } },
            { reference: { contains: s, mode: 'insensitive' } },
            {
                expenseBy: {
                    name: { contains: s, mode: 'insensitive' },
                },
            },
        ];
    }
    // Default Sort if none provided
    const orderBy = prismaQuery.orderBy || { expenseTime: 'desc' };
    const data = yield client_1.prisma.expense.findMany(Object.assign(Object.assign({}, prismaQuery), { where,
        orderBy, include: {
            expenseBy: { select: { id: true, name: true } },
        } }));
    const meta = yield queryBuilder.getPaginationMeta({
        count: (args) => { var _a; return client_1.prisma.expense.count({ where: Object.assign(Object.assign({}, where), ((_a = args === null || args === void 0 ? void 0 : args.where) !== null && _a !== void 0 ? _a : {})) }); },
    });
    return { meta, data };
});
const getExpenseById = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const expense = yield client_1.prisma.expense.findUnique({
        where: { id },
        include: {
            expenseBy: { select: { id: true, name: true } },
        },
    });
    if (!expense)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Expense not found');
    return expense;
});
const updateExpenseStatus = (id, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const data = {};
    if (payload.status)
        data.status = payload.status;
    if (typeof payload.isPaid === 'boolean')
        data.isPaid = payload.isPaid;
    const updated = yield client_1.prisma.expense.update({
        where: { id },
        data,
        include: {
            expenseBy: { select: { id: true, name: true } },
        },
    });
    return updated;
});
const deleteExpense = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const expense = yield client_1.prisma.expense.findUnique({ where: { id } });
    if (!expense)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Expense not found');
    return yield client_1.prisma.expense.delete({
        where: { id },
    });
});
const getExpenseAnalytics = (queryParams) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { startDate, endDate } = queryParams;
    const where = {};
    if (startDate || endDate) {
        where.expenseTime = {};
        if (startDate)
            where.expenseTime.gte = new Date(startDate);
        if (endDate) {
            const endDateTime = new Date(endDate);
            endDateTime.setHours(23, 59, 59, 999);
            where.expenseTime.lte = endDateTime;
        }
    }
    const [count, sum, byStatus] = yield Promise.all([
        client_1.prisma.expense.count({ where }),
        client_1.prisma.expense.aggregate({ where, _sum: { amount: true } }),
        client_1.prisma.expense.groupBy({
            by: ['status'],
            _count: { _all: true },
            _sum: { amount: true },
            where,
        }),
    ]);
    return {
        totalExpenses: count,
        totalAmount: (_a = sum._sum.amount) !== null && _a !== void 0 ? _a : 0,
        byStatus,
    };
});
exports.ExpenseServices = {
    createExpense,
    getAllExpenses,
    getExpenseById,
    updateExpenseStatus,
    deleteExpense,
    getExpenseAnalytics,
};
