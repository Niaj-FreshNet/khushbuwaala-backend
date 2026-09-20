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
exports.ProductServices = exports.updateProduct = exports.createProduct = void 0;
const date_fns_1 = require("date-fns");
const client_1 = require("../../../prisma/client");
const AppError_1 = __importDefault(require("../../errors/AppError"));
const queryBuilder_1 = __importDefault(require("../../helpers/queryBuilder"));
const product_constant_1 = require("./product.constant");
const slugify_1 = __importDefault(require("slugify"));
const sendImageToCloudinary_1 = require("../../utils/sendImageToCloudinary");
// Create Product
const createProduct = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const categoryExists = yield client_1.prisma.category.findUnique({
        where: { id: payload.categoryId },
    });
    if (!categoryExists) {
        throw new AppError_1.default(404, 'Category not found');
    }
    const existingSKUs = yield client_1.prisma.productVariant.findMany({
        where: { sku: { in: payload.variants.map(v => v.sku) } },
        select: { sku: true },
    });
    if (existingSKUs.length > 0) {
        throw new AppError_1.default(400, `SKU already exists: ${existingSKUs.map(s => s.sku).join(', ')}`);
    }
    const slug = (0, slugify_1.default)(payload.name, { lower: true, strict: true });
    const result = yield client_1.prisma.product.create({
        data: {
            name: payload.name,
            description: payload.description,
            slug,
            primaryImage: payload.primaryImage,
            otherImages: payload.otherImages || [],
            videoUrl: payload.videoUrl,
            tags: payload.tags,
            origin: payload.origin,
            brand: payload.brand,
            gender: payload.gender,
            perfumeNotes: payload.perfumeNotes,
            accords: payload.accords,
            performance: payload.performance,
            longevity: payload.longevity,
            projection: payload.projection,
            sillage: payload.sillage,
            bestFor: payload.bestFor,
            categoryId: payload.categoryId,
            published: payload.published,
            supplier: payload.supplier,
            stock: payload.stock,
            variants: {
                create: payload.variants.map(v => ({
                    sku: v.sku,
                    size: v.size,
                    unit: v.unit,
                    price: v.price,
                })),
            },
        },
        include: {
            variants: true,
            category: true,
        },
    });
    if ((_a = payload.materialIds) === null || _a === void 0 ? void 0 : _a.length) {
        for (const materialId of payload.materialIds) {
            yield client_1.prisma.productMaterial.upsert({
                where: { productId_materialId: { productId: result.id, materialId } },
                create: { productId: result.id, materialId },
                update: {},
            });
        }
    }
    if ((_b = payload.fragranceIds) === null || _b === void 0 ? void 0 : _b.length) {
        for (const fragranceId of payload.fragranceIds) {
            yield client_1.prisma.productFragrance.upsert({
                where: { productId_fragranceId: { productId: result.id, fragranceId } },
                create: { productId: result.id, fragranceId },
                update: {},
            });
        }
    }
    const finalProduct = yield client_1.prisma.product.findUnique({
        where: { id: result.id },
        include: {
            variants: true,
            category: true,
            ProductMaterial: { include: { material: true } },
            ProductFragrance: { include: { fragrance: true } },
        },
    });
    return formatProductDetailResponse(finalProduct);
});
exports.createProduct = createProduct;
// Shared: normalizes a comma-string or array into a clean string[]
const toArray = (val) => {
    if (!val)
        return [];
    if (Array.isArray(val))
        return val.map(String).filter(Boolean);
    if (typeof val === 'string')
        return val.split(',').map(s => s.trim()).filter(Boolean);
    return [];
};
// Shared: builds all the manual array/range/exact filters both public
// listing and admin/category listing need. Does NOT force `published`
// or add pagination/sort/include — callers do that themselves.
const applyProductFilters = (queryBuilder, query) => {
    if (query.gender && query.gender !== 'all') {
        queryBuilder.rawFilter({ gender: { equals: String(query.gender), mode: 'insensitive' } });
    }
    const accords = toArray(query.accords);
    if (accords.length)
        queryBuilder.rawFilter({ accords: { hasSome: accords } });
    const bestFor = toArray(query.bestFor);
    if (bestFor.length)
        queryBuilder.rawFilter({ bestFor: { hasSome: bestFor } });
    const tags = toArray(query.tags);
    if (tags.length)
        queryBuilder.rawFilter({ tags: { hasSome: tags } });
    const performance = toArray(query.performance);
    if (performance.length)
        queryBuilder.rawFilter({ performance: { in: performance } });
    const projection = toArray(query.projection);
    if (projection.length)
        queryBuilder.rawFilter({ projection: { in: projection } });
    const perfumeNotes = toArray(query.perfumeNotes);
    if (perfumeNotes.length) {
        queryBuilder.rawFilter({
            OR: [
                { perfumeNotes: { is: { top: { hasSome: perfumeNotes } } } },
                { perfumeNotes: { is: { middle: { hasSome: perfumeNotes } } } },
                { perfumeNotes: { is: { base: { hasSome: perfumeNotes } } } },
            ],
        });
    }
    const minPrice = query.minPrice != null ? Number(query.minPrice) : undefined;
    const maxPrice = query.maxPrice != null ? Number(query.maxPrice) : undefined;
    if (minPrice != null || maxPrice != null) {
        queryBuilder.rawFilter({
            variants: {
                some: {
                    price: Object.assign(Object.assign({}, (minPrice != null ? { gte: minPrice } : {})), (maxPrice != null ? { lte: maxPrice } : {})),
                },
            },
        });
    }
};
const runProductQuery = (query) => __awaiter(void 0, void 0, void 0, function* () {
    const queryBuilder = new queryBuilder_1.default(query, client_1.prisma.product);
    const categories = toArray(query.category);
    if (categories.length) {
        const cats = yield client_1.prisma.category.findMany({
            where: { OR: categories.map(cat => ({ categoryName: { equals: cat, mode: 'insensitive' } })) },
            select: { id: true },
        });
        const categoryIds = cats.map(c => c.id);
        if (!categoryIds.length) {
            return {
                results: [],
                meta: { page: Number(query.page) || 1, limit: Number(query.limit) || 20, total: 0, totalPage: 0 },
            };
        }
        queryBuilder.rawFilter({ categoryId: { in: categoryIds } });
    }
    applyProductFilters(queryBuilder, query);
    queryBuilder.rawFilter({ published: true });
    let results = yield queryBuilder
        .search(product_constant_1.productSearchFields)
        .sort()
        .paginate()
        .include(product_constant_1.LEAN_PRODUCT_INCLUDE)
        .execute();
    const meta = yield queryBuilder.countTotal();
    results = applySorting(results, query.sortBy);
    return { results, meta };
});
// Get All Products (Public)
const getAllProducts = (query) => __awaiter(void 0, void 0, void 0, function* () {
    const { results, meta } = yield runProductQuery(query);
    return { data: results.map(formatProductListingResponse), meta };
});
// Get All Products (Admin)
const getAllProductsAdmin = (query) => __awaiter(void 0, void 0, void 0, function* () {
    const queryBuilder = new queryBuilder_1.default(query, client_1.prisma.product);
    if (query.stock === 'in')
        queryBuilder.rawFilter({ stock: { gt: 0 } });
    else if (query.stock === 'out')
        queryBuilder.rawFilter({ stock: { lte: 0 } });
    applyProductFilters(queryBuilder, query);
    let results = yield queryBuilder
        .search(product_constant_1.productSearchFields)
        .sort()
        .paginate()
        .include(product_constant_1.productAdminInclude)
        .execute();
    const meta = yield queryBuilder.countTotal();
    results = applySorting(results, query.sortBy);
    return { data: results.map(formatProductAdminListingResponse), meta };
});
// Get Single Product
const getProduct = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const product = yield client_1.prisma.product.findUnique({
        where: { id },
        include: product_constant_1.productDetailInclude,
    });
    if (!product)
        return null;
    const relatedProducts = yield client_1.prisma.product.findMany({
        where: {
            OR: [
                { categoryId: product.categoryId },
                { brand: product.brand },
                { accords: { hasSome: product.accords } },
            ],
            id: { not: id },
            published: true,
        },
        include: product_constant_1.LEAN_PRODUCT_INCLUDE,
        take: product_constant_1.QUERY_DEFAULTS.RELATED_LIMIT,
        orderBy: { salesCount: 'desc' },
    });
    const formattedProduct = formatProductDetailResponse(product);
    return Object.assign(Object.assign({}, formattedProduct), { relatedProducts: {
            sameBrand: relatedProducts.map(formatProductListingResponse),
            sameCategory: relatedProducts.map(formatProductListingResponse),
            similarAccords: relatedProducts.map(formatProductListingResponse),
        } });
});
// Get Product By Slug
const getProductBySlug = (slug) => __awaiter(void 0, void 0, void 0, function* () {
    const product = yield client_1.prisma.product.findUnique({
        where: { slug },
        include: product_constant_1.productDetailInclude,
    });
    if (!product)
        return null;
    const relatedProducts = yield client_1.prisma.product.findMany({
        where: {
            OR: [
                { categoryId: product.categoryId },
                { brand: product.brand },
                { accords: { hasSome: product.accords } },
            ],
            id: { not: product.id },
            published: true,
        },
        include: product_constant_1.LEAN_PRODUCT_INCLUDE,
        take: product_constant_1.QUERY_DEFAULTS.RELATED_LIMIT,
        orderBy: { salesCount: 'desc' },
    });
    const formattedProduct = formatProductDetailResponse(product);
    return Object.assign(Object.assign({}, formattedProduct), { relatedProducts: {
            sameBrand: relatedProducts.map(formatProductListingResponse),
            sameCategory: relatedProducts.map(formatProductListingResponse),
            similarAccords: relatedProducts.map(formatProductListingResponse),
        } });
});
// Update Product
const updateProduct = (id, payload) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const existingProduct = yield client_1.prisma.product.findUnique({
        where: { id },
        include: {
            variants: true,
            ProductMaterial: true,
            ProductFragrance: true,
        },
    });
    if (!existingProduct) {
        throw new AppError_1.default(404, 'Product not found');
    }
    if (payload.categoryId) {
        const categoryExists = yield client_1.prisma.category.findUnique({
            where: { id: payload.categoryId },
        });
        if (!categoryExists) {
            throw new AppError_1.default(404, 'Category not found');
        }
    }
    let primaryImage = existingProduct.primaryImage;
    let otherImages = existingProduct.otherImages;
    if (payload.imagesToKeep || payload.newImages) {
        const imagesToKeep = payload.imagesToKeep || [];
        const newImages = payload.newImages || [];
        const currentImages = [existingProduct.primaryImage, ...existingProduct.otherImages];
        const imagesToDelete = currentImages.filter(img => img && !imagesToKeep.includes(img) && !newImages.includes(img));
        const safeDeleteCloudinary = (url) => __awaiter(void 0, void 0, void 0, function* () {
            const publicId = (0, sendImageToCloudinary_1.getPublicIdFromCloudinaryUrl)(url);
            if (!publicId)
                return;
            yield (0, sendImageToCloudinary_1.deleteFromCloudinaryByPublicId)(publicId);
        });
        yield Promise.all(imagesToDelete.map(safeDeleteCloudinary));
        const allNewImages = [...imagesToKeep, ...newImages];
        if (allNewImages.length > 0) {
            primaryImage = allNewImages[0];
            otherImages = allNewImages.slice(1);
        }
    }
    if ((_a = payload.variants) === null || _a === void 0 ? void 0 : _a.length) {
        const existingSKUs = yield client_1.prisma.productVariant.findMany({
            where: {
                sku: { in: payload.variants.map(v => v.sku) },
                productId: { not: id },
            },
            select: { sku: true },
        });
        if (existingSKUs.length > 0) {
            throw new AppError_1.default(400, `SKU already exists: ${existingSKUs.map(s => s.sku).join(', ')}`);
        }
    }
    const updatedProduct = yield client_1.prisma.product.update({
        where: { id },
        data: Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, (payload.name && { name: payload.name, slug: (0, slugify_1.default)(payload.name, { lower: true, strict: true }) })), (payload.description && { description: payload.description })), (primaryImage && { primaryImage })), (otherImages && { otherImages })), (payload.videoUrl !== undefined && { videoUrl: payload.videoUrl })), (payload.tags && { tags: payload.tags })), (payload.origin !== undefined && { origin: payload.origin })), (payload.brand !== undefined && { brand: payload.brand })), (payload.gender !== undefined && { gender: payload.gender })), (payload.perfumeNotes !== undefined && { perfumeNotes: payload.perfumeNotes })), (payload.accords && { accords: payload.accords })), (payload.performance !== undefined && { performance: payload.performance })), (payload.longevity !== undefined && { longevity: payload.longevity })), (payload.projection !== undefined && { projection: payload.projection })), (payload.sillage !== undefined && { sillage: payload.sillage })), (payload.bestFor && { bestFor: payload.bestFor })), (payload.stock !== undefined && { stock: payload.stock })), (payload.categoryId && { categoryId: payload.categoryId })), (typeof payload.published === 'boolean' && { published: payload.published })),
    });
    if ((_b = payload.variants) === null || _b === void 0 ? void 0 : _b.length) {
        yield client_1.prisma.productVariant.deleteMany({ where: { productId: id } });
        yield client_1.prisma.productVariant.createMany({
            data: payload.variants.map(v => ({
                sku: v.sku,
                size: v.size,
                unit: v.unit,
                price: v.price,
                productId: id,
            })),
        });
    }
    if (payload.materialIds) {
        yield client_1.prisma.productMaterial.deleteMany({
            where: { productId: id, materialId: { notIn: payload.materialIds } },
        });
        for (const materialId of payload.materialIds) {
            yield client_1.prisma.productMaterial.upsert({
                where: { productId_materialId: { productId: id, materialId } },
                create: { productId: id, materialId },
                update: {},
            });
        }
    }
    if (payload.fragranceIds) {
        yield client_1.prisma.productFragrance.deleteMany({
            where: { productId: id, fragranceId: { notIn: payload.fragranceIds } },
        });
        for (const fragranceId of payload.fragranceIds) {
            yield client_1.prisma.productFragrance.upsert({
                where: { productId_fragranceId: { productId: id, fragranceId } },
                create: { productId: id, fragranceId },
                update: {},
            });
        }
    }
    const finalProduct = yield client_1.prisma.product.findUnique({
        where: { id },
        include: {
            variants: true,
            category: true,
            ProductMaterial: { include: { material: true } },
            ProductFragrance: { include: { fragrance: true } },
        },
    });
    return formatProductDetailResponse(finalProduct);
});
exports.updateProduct = updateProduct;
// Delete Product
const deleteProduct = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const existingProduct = yield client_1.prisma.product.findUnique({
        where: { id },
        include: {
            variants: true,
            Review: true,
            wishlist: true,
            comboVariants: true,
        },
    });
    if (!existingProduct) {
        throw new AppError_1.default(404, product_constant_1.PRODUCT_ERROR_MESSAGES.NOT_FOUND);
    }
    const hasActiveOrders = yield client_1.prisma.order.findFirst({
        where: {
            productIds: { has: id },
            status: { not: 'CANCELED' },
        },
    });
    if (hasActiveOrders && existingProduct.published) {
        throw new AppError_1.default(400, product_constant_1.PRODUCT_ERROR_MESSAGES.PRODUCT_PUBLISHED_CANNOT_DELETE);
    }
    yield client_1.prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
        yield tx.wishlist.deleteMany({ where: { productId: id } });
        yield tx.comboVariant.deleteMany({ where: { productId: id } });
        yield tx.review.deleteMany({ where: { productId: id } });
        yield tx.productVariant.deleteMany({ where: { productId: id } });
        yield tx.discount.deleteMany({ where: { productId: id } });
        yield tx.product.delete({ where: { id } });
    }));
    const safeDeleteCloudinary = (url) => __awaiter(void 0, void 0, void 0, function* () {
        const publicId = (0, sendImageToCloudinary_1.getPublicIdFromCloudinaryUrl)(url);
        if (!publicId)
            return;
        yield (0, sendImageToCloudinary_1.deleteFromCloudinaryByPublicId)(publicId);
    });
    const allImages = [existingProduct.primaryImage, ...existingProduct.otherImages];
    yield Promise.all(allImages.filter(Boolean).map(safeDeleteCloudinary));
    return { id };
});
// Get Trending Products
const getTrendingProducts = () => __awaiter(void 0, void 0, void 0, function* () {
    const trendingProducts = yield client_1.prisma.product.findMany({
        where: { published: true },
        include: product_constant_1.LEAN_PRODUCT_INCLUDE,
        orderBy: { salesCount: 'desc' },
        take: product_constant_1.QUERY_DEFAULTS.TRENDING_LIMIT,
    });
    return trendingProducts.map((product) => (Object.assign(Object.assign({}, formatProductListingResponse(product)), { totalSold: product.salesCount || 0, trendingScore: Math.round((product.salesCount || 0) * 1.5) })));
});
// Get Navbar Products
const getNavbarProducts = () => __awaiter(void 0, void 0, void 0, function* () {
    const overallTrendingProducts = yield client_1.prisma.product.findMany({
        where: { published: true },
        select: { id: true, name: true, salesCount: true, categoryId: true },
        orderBy: { salesCount: 'desc' },
        take: 3,
    });
    const publishedCategories = yield client_1.prisma.category.findMany({
        where: { published: true },
        select: { id: true, categoryName: true }
    });
    const trendingByCategory = {};
    yield Promise.all(publishedCategories.map((category) => __awaiter(void 0, void 0, void 0, function* () {
        const topCatProducts = yield client_1.prisma.product.findMany({
            where: { categoryId: category.id, published: true },
            select: { id: true, name: true },
            orderBy: { salesCount: 'desc' },
            take: 3,
        });
        trendingByCategory[category.categoryName] = topCatProducts;
    })));
    const overallTrending = overallTrendingProducts.map(p => ({
        id: p.id,
        name: p.name,
    }));
    return { trendingByCategory, overallTrending };
});
// Get Featured Products
const getFeaturedProducts = () => __awaiter(void 0, void 0, void 0, function* () {
    const products = yield client_1.prisma.product.findMany({
        where: {
            published: true,
            salesCount: { gte: 10 },
        },
        include: product_constant_1.LEAN_PRODUCT_INCLUDE,
        orderBy: [{ salesCount: 'desc' }, { createdAt: 'desc' }],
        take: 12,
    });
    return products.map(formatProductListingResponse);
});
// Get New Arrivals
const getNewArrivals = () => __awaiter(void 0, void 0, void 0, function* () {
    const cutoffDate = (0, date_fns_1.subDays)(new Date(), product_constant_1.QUERY_DEFAULTS.NEW_ARRIVALS_DAYS);
    const products = yield client_1.prisma.product.findMany({
        where: {
            published: true,
            createdAt: { gte: cutoffDate },
        },
        include: product_constant_1.LEAN_PRODUCT_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: 12,
    });
    return products.map(formatProductListingResponse);
});
// Get Products by Category Name
const getProductsByCategoryName = (categoryName, query) => __awaiter(void 0, void 0, void 0, function* () {
    const category = yield client_1.prisma.category.findFirst({
        where: { categoryName: { equals: categoryName, mode: 'insensitive' } },
        select: { id: true }
    });
    if (!category) {
        return { data: [], meta: { total: 0, page: 1, limit: query.limit || 20, totalPage: 0 } };
    }
    return getProductsByCategoryId(category.id, query);
});
const getProductsByCategoryId = (categoryId, query) => __awaiter(void 0, void 0, void 0, function* () {
    const queryBuilder = new queryBuilder_1.default(query, client_1.prisma.product);
    applyProductFilters(queryBuilder, query);
    queryBuilder.rawFilter({ published: true, categoryId });
    let results = yield queryBuilder
        .search(product_constant_1.productSearchFields)
        .sort()
        .paginate()
        .include(product_constant_1.LEAN_PRODUCT_INCLUDE)
        .execute();
    const meta = yield queryBuilder.countTotal();
    results = applySorting(results, query.sortBy);
    return { data: results.map(formatProductListingResponse), meta };
});
// Get Related Products
const getRelatedProducts = (productId) => __awaiter(void 0, void 0, void 0, function* () {
    const product = yield client_1.prisma.product.findUnique({
        where: { id: productId },
        select: { categoryId: true, brand: true, accords: true },
    });
    if (!product) {
        throw new AppError_1.default(404, product_constant_1.PRODUCT_ERROR_MESSAGES.NOT_FOUND);
    }
    const [sameBrand, sameCategory, similarAccords] = yield Promise.all([
        client_1.prisma.product.findMany({
            where: { brand: product.brand, id: { not: productId }, published: true },
            include: product_constant_1.LEAN_PRODUCT_INCLUDE,
            take: 4,
            orderBy: { salesCount: 'desc' },
        }),
        client_1.prisma.product.findMany({
            where: { categoryId: product.categoryId, id: { not: productId }, published: true },
            include: product_constant_1.LEAN_PRODUCT_INCLUDE,
            take: 4,
            orderBy: { salesCount: 'desc' },
        }),
        client_1.prisma.product.findMany({
            where: { accords: { hasSome: product.accords }, id: { not: productId }, published: true },
            include: product_constant_1.LEAN_PRODUCT_INCLUDE,
            take: 4,
            orderBy: { salesCount: 'desc' },
        }),
    ]);
    return {
        sameBrand: sameBrand.map(formatProductListingResponse),
        sameCategory: sameCategory.map(formatProductListingResponse),
        similarAccords: similarAccords.map(formatProductListingResponse),
    };
});
// Search Products
const searchProducts = (query) => __awaiter(void 0, void 0, void 0, function* () {
    const { results, meta } = yield runProductQuery(query);
    return {
        data: results.map(formatProductSearchResponse),
        meta: {
            total: meta.total,
            page: meta.page,
            limit: meta.limit,
            totalPages: meta.totalPage,
        },
    };
});
// Get Product Variants
const getProductVariants = (productId) => __awaiter(void 0, void 0, void 0, function* () {
    const variants = yield client_1.prisma.productVariant.findMany({
        where: { productId },
        orderBy: [{ size: 'asc' }, { price: 'asc' }],
    });
    if (!variants.length) {
        throw new AppError_1.default(404, 'No variants found for this product');
    }
    return variants;
});
// Get Product Analytics
const getProductAnalytics = () => __awaiter(void 0, void 0, void 0, function* () {
    const [totalProducts, publishedProducts, totalVariants, priceStats, categoryStats, brandStats, stockStats,] = yield Promise.all([
        client_1.prisma.product.count(),
        client_1.prisma.product.count({ where: { published: true } }),
        client_1.prisma.productVariant.count(),
        client_1.prisma.productVariant.aggregate({ _avg: { price: true }, _sum: { price: true } }),
        client_1.prisma.product.groupBy({ by: ['categoryId'], _count: { _all: true }, where: { published: true } }),
        client_1.prisma.product.groupBy({ by: ['brand'], _count: { _all: true }, where: { published: true, brand: { not: null } } }),
        client_1.prisma.product.aggregate({ where: { stock: { lte: product_constant_1.QUERY_DEFAULTS.LOW_STOCK_THRESHOLD } }, _count: { _all: true } }),
    ]);
    const categories = yield client_1.prisma.category.findMany({
        where: { id: { in: categoryStats.map(c => c.categoryId) } },
    });
    const categoryMap = categories.reduce((acc, cat) => {
        acc[cat.id] = cat.categoryName;
        return acc;
    }, {});
    const topCategories = categoryStats.map(stat => ({
        categoryName: categoryMap[stat.categoryId] || 'Unknown',
        productCount: stat._count._all,
        percentage: Math.round((stat._count._all / publishedProducts) * 100),
    }));
    const topBrands = brandStats.map(stat => ({
        brand: stat.brand || 'Unknown',
        productCount: stat._count._all,
        percentage: Math.round((stat._count._all / publishedProducts) * 100),
    }));
    const outOfStockCount = yield client_1.prisma.product.count({ where: { stock: 0 } });
    return {
        totalProducts,
        publishedProducts,
        unpublishedProducts: totalProducts - publishedProducts,
        totalVariants,
        lowStockProducts: stockStats._count._all,
        outOfStockProducts: outOfStockCount,
        totalValue: priceStats._sum.price || 0,
        averagePrice: priceStats._avg.price || 0,
        topCategories: topCategories.slice(0, 5),
        topBrands: topBrands.slice(0, 5),
    };
});
// Get Low Stock Products
const getLowStockProducts = (...args_1) => __awaiter(void 0, [...args_1], void 0, function* (threshold = product_constant_1.QUERY_DEFAULTS.LOW_STOCK_THRESHOLD) {
    const products = yield client_1.prisma.product.findMany({
        where: { stock: { lte: threshold } },
        include: {
            variants: true,
            category: { select: { categoryName: true } },
        },
        orderBy: { name: 'asc' },
    });
    return products.map(product => ({
        id: product.id,
        name: product.name,
        category: product.category.categoryName,
        stock: product.stock,
        variants: product.variants.map(v => ({
            id: v.id,
            sku: v.sku,
            size: v.size,
            unit: v.unit,
            price: v.price,
        })),
    }));
});
// Get Bestsellers
const getBestsellers = () => __awaiter(void 0, void 0, void 0, function* () {
    const products = yield client_1.prisma.product.findMany({
        where: { published: true },
        include: product_constant_1.LEAN_PRODUCT_INCLUDE,
        orderBy: { salesCount: 'desc' },
        take: 20,
    });
    return products.map((product, index) => (Object.assign(Object.assign({}, formatProductListingResponse(product)), { totalSold: product.salesCount, trendingScore: 100 - index })));
});
// Update Product Stock
const updateProductStock = (productId, addedStock, reason) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const product = yield client_1.prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
        throw new AppError_1.default(404, product_constant_1.PRODUCT_ERROR_MESSAGES.PRODUCT_NOT_FOUND);
    }
    const newTotalStock = ((_a = product.stock) !== null && _a !== void 0 ? _a : 0) + addedStock;
    yield client_1.prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
        yield tx.product.update({ where: { id: productId }, data: { stock: newTotalStock } });
        yield tx.stockLog.create({
            data: { productId, change: addedStock, reason: reason || 'Stock updated', createdAt: new Date() },
        });
    }));
    const updatedProduct = yield client_1.prisma.product.findUnique({
        where: { id: productId },
        include: product_constant_1.productAdminInclude,
    });
    return formatProductDetailResponse(updatedProduct);
});
// Get Stock Logs
const getStockLogs = (productId) => __awaiter(void 0, void 0, void 0, function* () {
    const product = yield client_1.prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
        throw new AppError_1.default(404, product_constant_1.PRODUCT_ERROR_MESSAGES.PRODUCT_NOT_FOUND);
    }
    const logs = yield client_1.prisma.stockLog.findMany({
        where: { productId },
        include: { product: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
    });
    return logs.map((log) => ({
        id: log.id,
        productId: log.productId,
        change: log.change,
        reason: log.reason,
        createdAt: log.createdAt.toISOString(),
        product: { name: log.product.name },
    }));
});
// Shared helper — avoids repeating rating math across formatters
const computeRating = (reviews) => {
    const reviewCount = reviews.length;
    const averageRating = reviewCount > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount
        : 0;
    return { averageRating: parseFloat(averageRating.toFixed(2)), reviewCount };
};
// Pick the single best currently-active, non-coupon discount for a card badge
const pickBestDiscount = (discounts = []) => {
    if (!discounts.length)
        return undefined;
    const now = new Date();
    const active = discounts.filter((d) => {
        if (d.code && String(d.code).trim() !== '')
            return false; // Ignore promo coupons
        const startOk = !d.startDate || new Date(d.startDate) <= now;
        const endOk = !d.endDate || new Date(d.endDate) >= now;
        return startOk && endOk;
    });
    if (!active.length)
        return undefined;
    const best = active.reduce((a, b) => (b.value > a.value ? b : a));
    return { type: best.type, value: best.value };
};
// ============================================================
// 1) LISTING formatter (public storefront)
// ============================================================
const formatProductListingResponse = (product) => {
    const variants = product.variants || [];
    const prices = variants.map((v) => v.price);
    const { averageRating, reviewCount } = computeRating(product.Review || []);
    return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        primaryImage: product.primaryImage,
        otherImages: product.otherImages || [],
        accords: product.accords || [],
        published: product.published,
        salesCount: product.salesCount,
        variants: variants.map((v) => ({
            id: v.id,
            sku: v.sku,
            unit: v.unit,
            size: v.size,
            price: v.price,
        })),
        minPrice: prices.length ? Math.min(...prices) : 0,
        maxPrice: prices.length ? Math.max(...prices) : 0,
        totalStock: product.stock,
        inStock: product.stock > 0,
        averageRating,
        reviewCount,
        discount: pickBestDiscount(product.discounts),
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
    };
};
// ============================================================
// 1b) ADMIN LISTING formatter — keeps category + variant list
// ============================================================
const formatProductAdminListingResponse = (product) => {
    const base = formatProductListingResponse(product);
    const variants = product.variants || [];
    return Object.assign(Object.assign({}, base), { category: product.category, variants: variants.map((v) => ({
            id: v.id,
            sku: v.sku,
            unit: v.unit,
            size: v.size,
            price: v.price,
        })) });
};
// ============================================================
// 2) SEARCH formatter (minimal, fast)
// ============================================================
const formatProductSearchResponse = (product) => {
    var _a;
    const variants = product.variants || [];
    const prices = variants.map((v) => v.price);
    const { averageRating, reviewCount } = computeRating(product.Review || []);
    return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        primaryImage: product.primaryImage,
        accords: product.accords || [],
        categoryName: (_a = product.category) === null || _a === void 0 ? void 0 : _a.categoryName,
        minPrice: prices.length ? Math.min(...prices) : 0,
        maxPrice: prices.length ? Math.max(...prices) : 0,
        inStock: product.stock > 0,
        averageRating,
        reviewCount,
        discount: pickBestDiscount(product.discounts),
    };
};
// ============================================================
// 3) DETAIL formatter (single product page)
// ============================================================
const formatProductDetailResponse = (product) => {
    var _a, _b, _c, _d;
    const variants = product.variants || [];
    const prices = variants.map((v) => v.price);
    const reviews = product.Review || [];
    const { averageRating, reviewCount } = computeRating(reviews);
    const materials = ((_a = product.ProductMaterial) === null || _a === void 0 ? void 0 : _a.map((pm) => pm.material)) || [];
    const fragrances = ((_b = product.ProductFragrance) === null || _b === void 0 ? void 0 : _b.map((pf) => pf.fragrance)) || [];
    return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        primaryImage: product.primaryImage,
        brand: product.brand,
        gender: product.gender,
        origin: product.origin,
        accords: product.accords || [],
        bestFor: product.bestFor || [],
        tags: product.tags || [],
        published: product.published,
        salesCount: product.salesCount,
        categoryId: product.categoryId,
        category: product.category,
        minPrice: prices.length ? Math.min(...prices) : 0,
        maxPrice: prices.length ? Math.max(...prices) : 0,
        totalStock: product.stock,
        inStock: product.stock > 0,
        averageRating,
        reviewCount,
        description: product.description,
        videoUrl: product.videoUrl,
        otherImages: product.otherImages || [],
        perfumeNotes: product.perfumeNotes,
        performance: product.performance,
        longevity: product.longevity,
        projection: product.projection,
        sillage: product.sillage,
        materialIds: ((_c = product.ProductMaterial) === null || _c === void 0 ? void 0 : _c.map((m) => m.material.id)) || [],
        fragranceIds: ((_d = product.ProductFragrance) === null || _d === void 0 ? void 0 : _d.map((f) => f.fragrance.id)) || [],
        materials: materials.map((m) => ({ id: m.id, name: m.materialName })),
        fragrances: fragrances.map((f) => ({ id: f.id, name: f.fragranceName })),
        supplier: product.supplier,
        discounts: product.discounts || [],
        variants: variants.map((v) => (Object.assign(Object.assign({}, v), { discounts: v.discounts || [] }))),
        reviews: reviews.map((r) => ({
            id: r.id,
            rating: r.rating,
            title: r.title,
            comment: r.comment,
            isPublished: r.isPublished,
            productId: r.productId,
            userId: r.userId,
            user: r.user
                ? { name: r.user.name, imageUrl: r.user.imageUrl || '/default-avatar.png' }
                : { name: 'Anonymous', imageUrl: '/default-avatar.png' },
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
        })),
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
    };
};
const applySorting = (results, sortBy) => {
    if (sortBy === 'price_asc') {
        return results.sort((a, b) => {
            const minA = Math.min(...a.variants.map((v) => v.price));
            const minB = Math.min(...b.variants.map((v) => v.price));
            return minA - minB;
        });
    }
    else if (sortBy === 'price_desc') {
        return results.sort((a, b) => {
            const minA = Math.min(...a.variants.map((v) => v.price));
            const minB = Math.min(...b.variants.map((v) => v.price));
            return minB - minA;
        });
    }
    else if (sortBy === 'rating_asc') {
        return results.sort((a, b) => {
            var _a, _b;
            const avgA = ((_a = a.Review) === null || _a === void 0 ? void 0 : _a.length) ? a.Review.reduce((s, r) => s + r.rating, 0) / a.Review.length : 0;
            const avgB = ((_b = b.Review) === null || _b === void 0 ? void 0 : _b.length) ? b.Review.reduce((s, r) => s + r.rating, 0) / b.Review.length : 0;
            return avgA - avgB;
        });
    }
    else if (sortBy === 'rating_desc') {
        return results.sort((a, b) => {
            var _a, _b;
            const avgA = ((_a = a.Review) === null || _a === void 0 ? void 0 : _a.length) ? a.Review.reduce((s, r) => s + r.rating, 0) / a.Review.length : 0;
            const avgB = ((_b = b.Review) === null || _b === void 0 ? void 0 : _b.length) ? b.Review.reduce((s, r) => s + r.rating, 0) / b.Review.length : 0;
            return avgB - avgA;
        });
    }
    return results;
};
exports.ProductServices = {
    createProduct: exports.createProduct,
    getAllProducts,
    getAllProductsAdmin,
    getProduct,
    getProductBySlug,
    updateProduct: exports.updateProduct,
    deleteProduct,
    getTrendingProducts,
    getNavbarProducts,
    getFeaturedProducts,
    getNewArrivals,
    getProductsByCategoryId,
    getProductsByCategoryName,
    getRelatedProducts,
    searchProducts,
    getProductVariants,
    getProductAnalytics,
    getLowStockProducts,
    getBestsellers,
    updateProductStock,
    getStockLogs,
};
