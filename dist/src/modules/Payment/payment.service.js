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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentServices = void 0;
const client_1 = require("../../../prisma/client");
const QueryBuilder_1 = require("../../builder/QueryBuilder");
const getAllPaymentHistory = (queryParams) => __awaiter(void 0, void 0, void 0, function* () {
    const queryBuilder = new QueryBuilder_1.PrismaQueryBuilder(queryParams, ['id', 'gatewayInvoice', 'gatewayPaymentId']);
    const prismaQuery = queryBuilder
        .buildWhere()
        .buildSort()
        .buildPagination()
        .getQuery();
    const where = prismaQuery.where || {};
    // ✅ Match your exact schema PaymentState enums and safely auto-correct common spelling variations (like CANCELLED -> CANCELED)
    if (where.status && typeof where.status === 'string') {
        const statusVal = where.status.toUpperCase();
        const validStatuses = ['INITIATED', 'COMPLETED', 'FAILED', 'CANCELED', 'CANCELLED', 'REFUNDED'];
        if (validStatuses.includes(statusVal)) {
            // Normalize 'CANCELLED' to 'CANCELED' to match your schema enum
            where.status = statusVal === 'CANCELLED' ? 'CANCELED' : statusVal;
        }
        else {
            delete where.status;
        }
    }
    const payments = yield client_1.prisma.payment.findMany(Object.assign(Object.assign({}, prismaQuery), { where, include: {
            order: {
                select: {
                    id: true,
                    invoice: true,
                    amount: true,
                    method: true,
                    status: true,
                    isPaid: true,
                },
            },
        }, orderBy: { createdAt: 'desc' } }));
    const meta = yield queryBuilder.getPaginationMeta({
        count: (args) => client_1.prisma.payment.count({ where: args.where }),
    });
    return { meta, data: payments };
});
exports.PaymentServices = {
    getAllPaymentHistory,
};
