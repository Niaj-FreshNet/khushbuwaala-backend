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
exports.ReviewServices = void 0;
const QueryBuilder_1 = require("../../builder/QueryBuilder");
const AppError_1 = __importDefault(require("../../errors/AppError"));
const client_1 = require("../../../prisma/client");
const createReview = (id, payload) => __awaiter(void 0, void 0, void 0, function* () {
    if (!id)
        throw new AppError_1.default(404, 'User not found');
    // 1. Check if product exists
    const isProductExist = yield client_1.prisma.product.findUnique({
        where: { id: payload.productId },
    });
    if (!isProductExist)
        throw new AppError_1.default(404, 'Product not found');
    // 2. Validate rating
    if (payload.rating > 5 || payload.rating < 0)
        throw new AppError_1.default(400, 'Rating must be between 0 and 5');
    // 3. Check if user already reviewed this product
    const existingReview = yield client_1.prisma.review.findFirst({
        where: {
            productId: payload.productId,
            userId: id,
        },
    });
    if (existingReview) {
        throw new AppError_1.default(400, 'You have already reviewed this product');
    }
    const result = yield client_1.prisma.review.create({
        data: {
            rating: payload.rating,
            title: payload.title,
            comment: payload.comment,
            productId: payload.productId,
            userId: id,
        },
    });
    return result;
});
const getAllReviews = (queryParams) => __awaiter(void 0, void 0, void 0, function* () {
    const queryBuilder = new QueryBuilder_1.PrismaQueryBuilder(queryParams, [
        'title',
        'comment',
    ]);
    const prismaQuery = queryBuilder
        .buildWhere()
        .buildSort()
        .buildPagination()
        .buildSelect()
        .getQuery();
    // Merge additional filter (isPublish: true) without overriding existing filters
    prismaQuery.where = Object.assign(Object.assign({}, prismaQuery.where), { isPublished: true });
    // Perform query with merged filters and includes
    const reviews = yield client_1.prisma.review.findMany(Object.assign(Object.assign({}, prismaQuery), { include: {
            user: {
                select: {
                    name: true,
                    imageUrl: true,
                },
            },
        } }));
    // Meta calculation
    const meta = yield queryBuilder.getPaginationMeta(client_1.prisma.review);
    return {
        meta,
        data: reviews,
    };
});
const getAllReviewsAdmin = (queryParams) => __awaiter(void 0, void 0, void 0, function* () {
    const queryBuilder = new QueryBuilder_1.PrismaQueryBuilder(queryParams, [
        'title',
        'comment',
    ]);
    const prismaQuery = queryBuilder
        .buildWhere()
        .buildSort()
        .buildPagination()
        .buildSelect()
        .getQuery();
    // Merge additional filter (isPublish: true) without overriding existing filters
    prismaQuery.where = Object.assign({}, prismaQuery.where);
    // Perform query with merged filters and includes
    const reviews = yield client_1.prisma.review.findMany(Object.assign(Object.assign({}, prismaQuery), { include: {
            user: {
                select: {
                    name: true,
                    imageUrl: true,
                },
            },
        } }));
    // Meta calculation
    const meta = yield queryBuilder.getPaginationMeta(client_1.prisma.review);
    return {
        meta,
        data: reviews,
    };
});
const updateReview = (id, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield client_1.prisma.review.update({
        where: { id },
        data: payload,
    });
    return result;
});
exports.ReviewServices = {
    createReview,
    getAllReviews,
    getAllReviewsAdmin,
    updateReview,
};
