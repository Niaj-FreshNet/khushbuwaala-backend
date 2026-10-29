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
exports.BlogServices = void 0;
const slugify_1 = __importDefault(require("slugify"));
const QueryBuilder_1 = require("../../builder/QueryBuilder");
const AppError_1 = __importDefault(require("../../errors/AppError"));
const fileDelete_1 = require("../../helpers/fileDelete");
const client_1 = require("../../../prisma/client");
const generateUniqueSlug = (title, currentId) => __awaiter(void 0, void 0, void 0, function* () {
    let baseSlug = (0, slugify_1.default)(title, { lower: true, strict: true, trim: true });
    let slug = baseSlug;
    let counter = 1;
    while (true) {
        const existing = yield client_1.prisma.blog.findUnique({ where: { slug } });
        if (!existing || (currentId && existing.id === currentId)) {
            return slug;
        }
        slug = `${baseSlug}-${counter}`;
        counter++;
    }
});
const createBlog = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const slug = yield generateUniqueSlug(payload.title);
    const result = yield client_1.prisma.blog.create({
        data: {
            userId: payload.userId,
            title: payload.title,
            content: payload.content,
            imageUrl: payload.imageUrl,
            others: payload.others,
            isPublish: (_a = payload.isPublish) !== null && _a !== void 0 ? _a : false,
            metaTitle: payload.metaTitle,
            metaDescription: payload.metaDescription,
            keywords: payload.keywords,
            slug,
        },
    });
    return result;
});
const updateBlog = (id, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const updateData = Object.assign({}, payload);
    if (payload.title) {
        updateData.slug = yield generateUniqueSlug(payload.title, id);
    }
    const result = yield client_1.prisma.blog.update({
        where: { id },
        data: updateData,
    });
    return result;
});
const getAllBlogs = (queryParams) => __awaiter(void 0, void 0, void 0, function* () {
    const filterParams = Object.assign(Object.assign({}, queryParams), { isPublish: true });
    const queryBuilder = new QueryBuilder_1.PrismaQueryBuilder(filterParams, [
        'title',
        'content',
    ]);
    const prismaQuery = queryBuilder
        .buildWhere()
        .buildSort()
        .buildPagination()
        .buildSelect()
        .getQuery();
    const blogs = yield client_1.prisma.blog.findMany(Object.assign(Object.assign({}, prismaQuery), { where: Object.assign(Object.assign({}, prismaQuery.where), { isPublish: true }), include: {
            user: {
                select: {
                    id: true,
                    name: true,
                    imageUrl: true,
                },
            },
        }, orderBy: { createdAt: 'desc' } }));
    const meta = yield queryBuilder.getPaginationMeta(client_1.prisma.blog);
    return { meta, data: blogs };
});
const getAllBlogsAdmin = (queryParams) => __awaiter(void 0, void 0, void 0, function* () {
    const queryBuilder = new QueryBuilder_1.PrismaQueryBuilder(queryParams, [
        'title',
        'content',
    ]);
    const prismaQuery = queryBuilder
        .buildWhere()
        .buildSort()
        .buildPagination()
        .buildSelect()
        .getQuery();
    const blogs = yield client_1.prisma.blog.findMany(Object.assign(Object.assign({}, prismaQuery), { include: {
            user: {
                select: {
                    id: true,
                    name: true,
                    imageUrl: true,
                },
            },
        }, orderBy: { createdAt: 'desc' } }));
    const meta = yield queryBuilder.getPaginationMeta(client_1.prisma.blog);
    return { meta, data: blogs };
});
const getBlog = (slug) => __awaiter(void 0, void 0, void 0, function* () {
    const blog = yield client_1.prisma.blog.findUnique({
        where: { slug, isPublish: true },
        include: {
            user: { select: { id: true, name: true, imageUrl: true, email: true } },
        },
    });
    if (!blog)
        return null;
    const relatedBlogs = yield client_1.prisma.blog.findMany({
        where: {
            NOT: { slug },
            isPublish: true,
        },
        select: {
            id: true,
            title: true,
            content: true,
            imageUrl: true,
            slug: true,
            metaTitle: true,
            metaDescription: true,
            keywords: true,
            createdAt: true,
        },
        take: 4,
        orderBy: { createdAt: 'desc' },
    });
    return { blog, relatedBlogs };
});
const deleteBlog = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const blog = yield client_1.prisma.blog.findUnique({ where: { id } });
    if (!blog)
        throw new AppError_1.default(404, 'Blog not found');
    if (blog.imageUrl) {
        yield (0, fileDelete_1.deleteFile)(blog.imageUrl);
    }
    return yield client_1.prisma.blog.delete({ where: { id } });
});
exports.BlogServices = {
    createBlog,
    getAllBlogs,
    getAllBlogsAdmin,
    getBlog,
    updateBlog,
    deleteBlog,
};
