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
    const slug = (0, slugify_1.default)(payload.name, { lower: true, strict: true });
    // 1. Run category and SKU duplicate validation concurrently
    const [categoryExists, existingSKUs] = yield Promise.all([
        client_1.prisma.category.findUnique({ where: { id: payload.categoryId }, select: { id: true } }),
        client_1.prisma.productVariant.findMany({
            where: { sku: { in: payload.variants.map(v => v.sku) } },
            select: { sku: true },
        }),
    ]);
    if (!categoryExists) {
        throw new AppError_1.default(404, 'Category not found');
    }
    if (existingSKUs.length > 0) {
        throw new AppError_1.default(400, `SKU already exists: ${existingSKUs.map(s => s.sku).join(', ')}`);
    }
    // 2. Use a transaction to perform product creation and relations in a single fast batch
    const result = yield client_1.prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b;
        const product = yield tx.product.create({
            data: {
                name: payload.name,
                description: payload.description,
                slug,
                primaryImage: payload.primaryImage,
                otherImages: payload.otherImages || [],
                videos: payload.videos || [],
                tags: payload.tags,
                brand: payload.brand,
                condition: payload.condition || 'new',
                itemGroupId: payload.itemGroupId,
                googleProductCategory: payload.googleProductCategory,
                origin: payload.origin,
                gender: payload.gender,
                metaTitle: payload.metaTitle,
                metaDescription: payload.metaDescription,
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
                    create: payload.variants.map(v => {
                        var _a, _b, _c;
                        return ({
                            sku: v.sku,
                            size: v.size,
                            unit: v.unit,
                            price: v.price,
                            stock: (_a = v.stock) !== null && _a !== void 0 ? _a : 0,
                            published: (_b = v.published) !== null && _b !== void 0 ? _b : true,
                            isDefault: (_c = v.isDefault) !== null && _c !== void 0 ? _c : false,
                            gtin: v.gtin,
                            mpn: v.mpn,
                            barcode: v.barcode,
                            compareAtPrice: v.compareAtPrice,
                            costPrice: v.costPrice,
                            weightGrams: v.weightGrams,
                            attributes: v.attributes || {},
                            images: v.images || [],
                        });
                    }),
                },
            },
        });
        // Bulk insert or link product materials safely
        if ((_a = payload.materialIds) === null || _a === void 0 ? void 0 : _a.length) {
            for (const materialId of payload.materialIds) {
                yield tx.productMaterial.upsert({
                    where: { productId_materialId: { productId: product.id, materialId } },
                    create: { productId: product.id, materialId },
                    update: {},
                });
            }
        }
        // Bulk insert or link product fragrances safely
        if ((_b = payload.fragranceIds) === null || _b === void 0 ? void 0 : _b.length) {
            for (const fragranceId of payload.fragranceIds) {
                yield tx.productFragrance.upsert({
                    where: { productId_fragranceId: { productId: product.id, fragranceId } },
                    create: { productId: product.id, fragranceId },
                    update: {},
                });
            }
        }
        return product;
    }));
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
const toArray = (val) => {
    if (!val)
        return [];
    if (Array.isArray(val))
        return val.map(String).filter(Boolean);
    if (typeof val === 'string')
        return val.split(',').map(s => s.trim()).filter(Boolean);
    return [];
};
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
const getAllProducts = (query) => __awaiter(void 0, void 0, void 0, function* () {
    const { results, meta } = yield runProductQuery(query);
    return { data: results.map(formatProductListingResponse), meta };
});
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
    const formattedProduct = formatProductAdminDetailResponse(product);
    return Object.assign(Object.assign({}, formattedProduct), { relatedProducts: {
            sameBrand: relatedProducts.map(formatProductListingResponse),
            sameCategory: relatedProducts.map(formatProductListingResponse),
            similarAccords: relatedProducts.map(formatProductListingResponse),
        } });
});
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
const updateProduct = (id, payload) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    // 1. Fetch product and category existence check concurrently if categoryId is updated
    const [existingProduct, categoryExists] = yield Promise.all([
        client_1.prisma.product.findUnique({
            where: { id },
            include: {
                variants: true,
                ProductMaterial: true,
                ProductFragrance: true,
            },
        }),
        payload.categoryId
            ? client_1.prisma.category.findUnique({ where: { id: payload.categoryId }, select: { id: true } })
            : Promise.resolve(true),
    ]);
    if (!existingProduct) {
        throw new AppError_1.default(404, 'Product not found');
    }
    if (payload.categoryId && !categoryExists) {
        throw new AppError_1.default(404, 'Category not found');
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
        Promise.all(imagesToDelete.map(safeDeleteCloudinary)).catch(err => console.error('Cloudinary cleanup error:', err));
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
    // 2. Wrap update operations in an atomic transaction with an increased timeout (15s)
    yield client_1.prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        // Update basic product info
        yield tx.product.update({
            where: { id },
            data: Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, (payload.name && { name: payload.name, slug: (0, slugify_1.default)(payload.name, { lower: true, strict: true }) })), (payload.description && { description: payload.description })), (primaryImage && { primaryImage })), (otherImages && { otherImages })), (payload.videos && { videos: payload.videos })), (payload.tags && { tags: payload.tags })), (payload.brand !== undefined && { brand: payload.brand })), (payload.condition !== undefined && { condition: payload.condition })), (payload.itemGroupId !== undefined && { itemGroupId: payload.itemGroupId })), (payload.googleProductCategory !== undefined && { googleProductCategory: payload.googleProductCategory })), (payload.origin !== undefined && { origin: payload.origin })), (payload.gender !== undefined && { gender: payload.gender })), (payload.metaTitle !== undefined && { metaTitle: payload.metaTitle })), (payload.metaDescription !== undefined && { metaDescription: payload.metaDescription })), (payload.perfumeNotes !== undefined && { perfumeNotes: payload.perfumeNotes })), (payload.accords && { accords: payload.accords })), (payload.performance !== undefined && { performance: payload.performance })), (payload.longevity !== undefined && { longevity: payload.longevity })), (payload.projection !== undefined && { projection: payload.projection })), (payload.sillage !== undefined && { sillage: payload.sillage })), (payload.bestFor && { bestFor: payload.bestFor })), (payload.stock !== undefined && { stock: payload.stock })), (payload.categoryId && { categoryId: payload.categoryId })), (typeof payload.published === 'boolean' && { published: payload.published })),
        });
        // Replace variants if provided
        if ((_a = payload.variants) === null || _a === void 0 ? void 0 : _a.length) {
            yield tx.productVariant.deleteMany({ where: { productId: id } });
            yield tx.productVariant.createMany({
                data: payload.variants.map(v => {
                    var _a, _b, _c;
                    return ({
                        sku: v.sku,
                        size: v.size,
                        unit: v.unit,
                        price: v.price,
                        stock: (_a = v.stock) !== null && _a !== void 0 ? _a : 0,
                        published: (_b = v.published) !== null && _b !== void 0 ? _b : true,
                        isDefault: (_c = v.isDefault) !== null && _c !== void 0 ? _c : false,
                        gtin: v.gtin,
                        mpn: v.mpn,
                        barcode: v.barcode,
                        compareAtPrice: v.compareAtPrice,
                        costPrice: v.costPrice,
                        weightGrams: v.weightGrams,
                        attributes: v.attributes || {},
                        images: v.images || [],
                        productId: id,
                    });
                }),
            });
        }
        // ⚡ Update materials concurrently using Promise.all
        if (payload.materialIds) {
            yield tx.productMaterial.deleteMany({
                where: { productId: id, materialId: { notIn: payload.materialIds } },
            });
            if (payload.materialIds.length > 0) {
                yield Promise.all(payload.materialIds.map(materialId => tx.productMaterial.upsert({
                    where: { productId_materialId: { productId: id, materialId } },
                    create: { productId: id, materialId },
                    update: {},
                })));
            }
        }
        // ⚡ Update fragrances concurrently using Promise.all
        if (payload.fragranceIds) {
            yield tx.productFragrance.deleteMany({
                where: { productId: id, fragranceId: { notIn: payload.fragranceIds } },
            });
            if (payload.fragranceIds.length > 0) {
                yield Promise.all(payload.fragranceIds.map(fragranceId => tx.productFragrance.upsert({
                    where: { productId_fragranceId: { productId: id, fragranceId } },
                    create: { productId: id, fragranceId },
                    update: {},
                })));
            }
        }
    }), {
        maxWait: 10000, // 10s max wait to acquire connection
        timeout: 15000, // 15s timeout limit for the transaction
    });
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
    // ⚡ 1. Execute DB transaction with an expanded timeout window (e.g. 15 seconds)
    yield client_1.prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
        yield tx.cartItem.deleteMany({ where: { productId: id } });
        yield tx.wishlist.deleteMany({ where: { productId: id } });
        yield tx.comboVariant.deleteMany({ where: { productId: id } });
        yield tx.review.deleteMany({ where: { productId: id } });
        yield tx.productVariant.deleteMany({ where: { productId: id } });
        yield tx.discount.deleteMany({ where: { productId: id } });
        yield tx.product.delete({ where: { id } });
    }), {
        maxWait: 10000, // Max wait time to connect to transaction pool
        timeout: 15000, // Increased transaction timeout to 15 seconds
    });
    // ⚡ 2. Handle Cloudinary cleanup AFTER the transaction has safely closed
    const safeDeleteCloudinary = (url) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const publicId = (0, sendImageToCloudinary_1.getPublicIdFromCloudinaryUrl)(url);
            if (!publicId)
                return;
            yield (0, sendImageToCloudinary_1.deleteFromCloudinaryByPublicId)(publicId);
        }
        catch (err) {
            console.error('Cloudinary deletion failed for URL:', url, err);
        }
    });
    const allImages = [existingProduct.primaryImage, ...existingProduct.otherImages];
    // Run image deletions asynchronously in the background so they don't block the response
    Promise.all(allImages.filter(Boolean).map(safeDeleteCloudinary)).catch((err) => console.error('Background image cleanup error:', err));
    return { id };
});
const getTrendingProducts = () => __awaiter(void 0, void 0, void 0, function* () {
    const trendingProducts = yield client_1.prisma.product.findMany({
        where: { published: true },
        include: product_constant_1.LEAN_PRODUCT_INCLUDE,
        orderBy: { salesCount: 'desc' },
        take: product_constant_1.QUERY_DEFAULTS.TRENDING_LIMIT,
    });
    return trendingProducts.map((product) => (Object.assign(Object.assign({}, formatProductListingResponse(product)), { totalSold: product.salesCount || 0, trendingScore: Math.round((product.salesCount || 0) * 1.5) })));
});
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
            stock: v.stock,
        })),
    }));
});
const getBestsellers = () => __awaiter(void 0, void 0, void 0, function* () {
    const products = yield client_1.prisma.product.findMany({
        where: { published: true },
        include: product_constant_1.LEAN_PRODUCT_INCLUDE,
        orderBy: { salesCount: 'desc' },
        take: 20,
    });
    return products.map((product, index) => (Object.assign(Object.assign({}, formatProductAdminListingResponse(product)), { totalSold: product.salesCount, trendingScore: 100 - index })));
});
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
const computeRating = (reviews) => {
    const reviewCount = reviews.length;
    const averageRating = reviewCount > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount
        : 0;
    return { averageRating: parseFloat(averageRating.toFixed(2)), reviewCount };
};
const pickBestDiscount = (discounts = []) => {
    if (!discounts.length)
        return undefined;
    const now = new Date();
    const active = discounts.filter((d) => {
        if (d.code && String(d.code).trim() !== '')
            return false;
        const startOk = !d.startDate || new Date(d.startDate) <= now;
        const endOk = !d.endDate || new Date(d.endDate) >= now;
        return startOk && endOk;
    });
    if (!active.length)
        return undefined;
    const best = active.reduce((a, b) => (b.value > a.value ? b : a));
    return { type: best.type, value: best.value };
};
const formatProductListingResponse = (product) => {
    const variants = (product.variants || []).filter((v) => v.published !== false);
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
            stock: v.stock,
            isDefault: v.isDefault,
            published: v.published,
            compareAtPrice: v.compareAtPrice,
            images: v.images || [],
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
const formatProductAdminListingResponse = (product) => {
    const base = formatProductListingResponse(product);
    const variants = product.variants || [];
    return Object.assign(Object.assign({}, base), { supplier: product.supplier || null, category: product.category, variants: variants.map((v) => {
            var _a;
            return ({
                id: v.id,
                sku: v.sku,
                unit: v.unit,
                size: v.size,
                price: v.price,
                stock: v.stock,
                isDefault: v.isDefault,
                published: (_a = v.published) !== null && _a !== void 0 ? _a : true,
                compareAtPrice: v.compareAtPrice,
                images: v.images || [],
            });
        }) });
};
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
const formatProductDetailResponse = (product) => {
    var _a, _b, _c, _d;
    const variants = (product.variants || []).filter((v) => v.published !== false);
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
        condition: product.condition,
        itemGroupId: product.itemGroupId,
        googleProductCategory: product.googleProductCategory,
        gender: product.gender,
        metaTitle: product.metaTitle,
        metaDescription: product.metaDescription,
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
        variants: variants.map((v) => (Object.assign(Object.assign({}, v), { images: v.images || [], discounts: v.discounts || [] }))),
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
const formatProductAdminDetailResponse = (product) => {
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
        condition: product.condition,
        itemGroupId: product.itemGroupId,
        googleProductCategory: product.googleProductCategory,
        gender: product.gender,
        metaTitle: product.metaTitle,
        metaDescription: product.metaDescription,
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
        videos: product.videos || [],
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
        // ⚡ Explicitly preserve variant publication status for admin views
        variants: variants.map((v) => {
            var _a;
            return (Object.assign(Object.assign({}, v), { published: (_a = v.published) !== null && _a !== void 0 ? _a : true, images: v.images || [], discounts: v.discounts || [] }));
        }),
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
const upsertVariantPackagingCost = (sku, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const totalCost = payload.costLines.reduce((sum, line) => sum + line.amount, 0);
    const variant = yield client_1.prisma.productVariant.findUnique({ where: { sku } });
    if (!variant) {
        throw new AppError_1.default(404, `Variant with SKU ${sku} not found.`);
    }
    return yield client_1.prisma.variantPackagingCost.upsert({
        where: { sku },
        update: {
            costLines: payload.costLines,
            totalCost,
        },
        create: {
            sku,
            costLines: payload.costLines,
            totalCost,
        },
    });
});
const addStockPurchaseAndUpdateWAC = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    const { productId, quantity, costLines, supplier, billNo, note, unit, createdById } = payload;
    const totalPurchaseCost = costLines.reduce((sum, line) => sum + line.amount, 0);
    const costPerUnit = totalPurchaseCost / quantity;
    return yield client_1.prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
        // 1. Get current stock and current live cost
        const product = yield tx.product.findUnique({ where: { id: productId } });
        if (!product)
            throw new AppError_1.default(404, product_constant_1.PRODUCT_ERROR_MESSAGES.NOT_FOUND);
        const currentCostData = yield tx.productCost.findUnique({ where: { productId } });
        const currentStock = product.stock || 0;
        const currentAvgCost = (currentCostData === null || currentCostData === void 0 ? void 0 : currentCostData.avgCostPerUnit) || 0;
        // 2. Calculate New Weighted Average Cost (WAC)
        // Formula: ((Old Stock * Old Avg Cost) + New Purchase Cost) / (Old Stock + New Stock)
        const totalCurrentValue = currentStock * currentAvgCost;
        const newTotalStock = currentStock + quantity;
        const newAvgCostPerUnit = (totalCurrentValue + totalPurchaseCost) / newTotalStock;
        // 3. Log the Financial Purchase
        const purchase = yield tx.stockPurchase.create({
            data: {
                productId,
                quantity,
                unit,
                totalCost: totalPurchaseCost,
                costPerUnit,
                costLines,
                supplier,
                billNo,
                note,
                createdById,
                isOpening: currentStock === 0, // Flag as opening stock if it was 0
            },
        });
        // 4. Update the live ProductCost WAC
        yield tx.productCost.upsert({
            where: { productId },
            update: {
                avgCostPerUnit: newAvgCostPerUnit,
                lastCostPerUnit: costPerUnit,
            },
            create: {
                productId,
                avgCostPerUnit: costPerUnit, // Fallback if no history
                lastCostPerUnit: costPerUnit,
            },
        });
        // 5. Update actual Product Stock
        yield tx.product.update({
            where: { id: productId },
            data: { stock: { increment: quantity } },
        });
        // 6. Push a standard Stock Log for frontend history
        yield tx.stockLog.create({
            data: {
                productId,
                change: quantity,
                reason: `Purchase Bill: ${billNo || 'N/A'} - Supp: ${supplier || 'N/A'}`,
            },
        });
        return purchase;
    }));
});
const generateGoogleShoppingFeed = () => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e;
    // Fetch all published products with their variants and category relations
    const products = yield client_1.prisma.product.findMany({
        where: { published: true },
        include: {
            variants: true,
            category: { select: { categoryName: true } },
        },
    });
    const domain = process.env.FRONTEND_LIVE_URL || 'https://khushbuwaala.com';
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n`;
    xml += `  <channel>\n`;
    xml += `    <title>Khushbuwaala Product Catalog</title>\n`;
    xml += `    <link>${domain}</link>\n`;
    xml += `    <description>Bespoke fragrances, attars, and custom perfumes catalog</description>\n`;
    for (const product of products) {
        const parentId = product.id;
        const brand = product.brand || 'Khushbuwaala';
        const category = ((_a = product.category) === null || _a === void 0 ? void 0 : _a.categoryName) || 'Health & Beauty > Personal Care > Cosmetics > Perfume';
        const description = (product.description || '').replace(/<\/?[^>]+(>|$)/g, "").trim(); // Safe HTML strip
        // Collect additional image links for Google Merchant Center g:additional_image_link
        const additionalImages = (product.otherImages || []).slice(0, 10); // Google allows up to 10 additional images
        // Collect product showcase videos for g:video_link
        const productVideos = product.videos || [];
        if (product.variants && product.variants.length > 0) {
            for (const variant of product.variants) {
                // Skip unpublished variants if they are explicitly marked false
                if (variant.published === false)
                    continue;
                const variantImages = ((_b = variant.images) === null || _b === void 0 ? void 0 : _b.length) ? variant.images : [product.primaryImage];
                const primaryVariantImage = variantImages[0] || product.primaryImage;
                const variantAdditionalImages = [...variantImages.slice(1), ...additionalImages].slice(0, 10);
                const variantUrl = `${domain}/products/${product.slug}?variant=${variant.id}`;
                const availability = (variant.stock > 0 || product.stock > 0) ? 'in_stock' : 'out_of_stock';
                const priceStr = `${variant.price.toFixed(2)} BDT`;
                const regularPriceStr = variant.compareAtPrice ? `${variant.compareAtPrice.toFixed(2)} BDT` : priceStr;
                xml += `    <item>\n`;
                xml += `      <g:id>${variant.sku}</g:id>\n`;
                xml += `      <g:title><![CDATA[${product.name} - ${variant.size}${variant.unit}]]></g:title>\n`;
                xml += `      <g:description><![CDATA[${description}]]></g:description>\n`;
                xml += `      <g:link>${variantUrl}</g:link>\n`;
                xml += `      <g:image_link>${primaryVariantImage}</g:image_link>\n`;
                // Additional Images
                for (const imgLink of variantAdditionalImages) {
                    xml += `      <g:additional_image_link>${imgLink}</g:additional_image_link>\n`;
                }
                // Showcase Videos
                for (const vidLink of productVideos) {
                    xml += `      <g:video_link>${vidLink}</g:video_link>\n`;
                }
                xml += `      <g:condition>${product.condition || 'new'}</g:condition>\n`;
                xml += `      <g:availability>${availability}</g:availability>\n`;
                xml += `      <g:price>${regularPriceStr}</g:price>\n`;
                if (variant.compareAtPrice) {
                    xml += `      <g:sale_price>${priceStr}</g:sale_price>\n`;
                }
                xml += `      <g:brand><![CDATA[${brand}]]></g:brand>\n`;
                xml += `      <g:item_group_id>${parentId}</g:item_group_id>\n`;
                xml += `      <g:google_product_category><![CDATA[${product.googleProductCategory || category}]]></g:google_product_category>\n`;
                xml += `      <g:gender>${((_c = product.gender) === null || _c === void 0 ? void 0 : _c.toLowerCase()) || 'unisex'}</g:gender>\n`;
                xml += `      <g:age_group>${((_d = product.bestFor) === null || _d === void 0 ? void 0 : _d.join(', ')) || 'all'}</g:age_group>\n`;
                xml += `      <g:meta_title><![CDATA[${product.metaTitle || product.name}]]></g:meta_title>\n`;
                xml += `      <g:meta_description><![CDATA[${product.metaDescription || description}]]></g:meta_description>\n`;
                if (variant.gtin)
                    xml += `      <g:gtin>${variant.gtin}</g:gtin>\n`;
                if (variant.weightGrams)
                    xml += `      <g:shipping_weight>${variant.weightGrams} g</g:shipping_weight>\n`;
                xml += `    </item>\n`;
            }
        }
        else {
            // Fallback for products without variants
            const availability = product.stock > 0 ? 'in_stock' : 'out_of_stock';
            xml += `    <item>\n`;
            xml += `      <g:id>${product.id}</g:id>\n`;
            xml += `      <g:title><![CDATA[${product.name}]]></g:title>\n`;
            xml += `      <g:description><![CDATA[${description}]]></g:description>\n`;
            xml += `      <g:link>${domain}/products/${product.slug}</g:link>\n`;
            xml += `      <g:image_link>${product.primaryImage}</g:image_link>\n`;
            for (const imgLink of additionalImages) {
                xml += `      <g:additional_image_link>${imgLink}</g:additional_image_link>\n`;
            }
            for (const vidLink of productVideos) {
                xml += `      <g:video_link>${vidLink}</g:video_link>\n`;
            }
            xml += `      <g:condition>${product.condition || 'new'}</g:condition>\n`;
            xml += `      <g:availability>${availability}</g:availability>\n`;
            xml += `      <g:price>${product.minPrice.toFixed(2)} BDT</g:price>\n`;
            xml += `      <g:brand><![CDATA[${brand}]]></g:brand>\n`;
            xml += `      <g:google_product_category><![CDATA[${category}]]></g:google_product_category>\n`;
            xml += `      <g:gender>${((_e = product.gender) === null || _e === void 0 ? void 0 : _e.toLowerCase()) || 'unisex'}</g:gender>\n`;
            xml += `    </item>\n`;
        }
    }
    xml += `  </channel>\n`;
    xml += `</rss>`;
    return xml;
});
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
    upsertVariantPackagingCost,
    addStockPurchaseAndUpdateWAC,
    generateGoogleShoppingFeed,
};
