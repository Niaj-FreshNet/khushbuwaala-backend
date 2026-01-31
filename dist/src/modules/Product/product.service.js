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
const client_2 = require("@prisma/client");
const slugify_1 = __importDefault(require("slugify"));
const sendImageToCloudinary_1 = require("../../utils/sendImageToCloudinary");
// Create Product
const createProduct = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    // Check if category exists
    const categoryExists = yield client_1.prisma.category.findUnique({
        where: { id: payload.categoryId },
    });
    if (!categoryExists) {
        throw new AppError_1.default(404, 'Category not found');
    }
    // Check for duplicate SKUs
    const existingSKUs = yield client_1.prisma.productVariant.findMany({
        where: { sku: { in: payload.variants.map(v => v.sku) } },
        select: { sku: true },
    });
    if (existingSKUs.length > 0) {
        throw new AppError_1.default(400, `SKU already exists: ${existingSKUs.map(s => s.sku).join(', ')}`);
    }
    // Generate slug
    const slug = (0, slugify_1.default)(payload.name, { lower: true, strict: true });
    // 1️⃣ Create the product first
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
                    unit: client_2.Unit.ML,
                    price: v.price,
                })),
            },
        },
        include: {
            variants: true,
            category: true,
        },
    });
    // 2️⃣ Add Material relations using upsert (safe for MongoDB)
    if ((_a = payload.materialIds) === null || _a === void 0 ? void 0 : _a.length) {
        for (const materialId of payload.materialIds) {
            yield client_1.prisma.productMaterial.upsert({
                where: {
                    productId_materialId: {
                        productId: result.id,
                        materialId,
                    },
                },
                create: { productId: result.id, materialId },
                update: {}, // do nothing if exists
            });
        }
    }
    // 3️⃣ Add Fragrance relations using upsert
    if ((_b = payload.fragranceIds) === null || _b === void 0 ? void 0 : _b.length) {
        for (const fragranceId of payload.fragranceIds) {
            yield client_1.prisma.productFragrance.upsert({
                where: {
                    productId_fragranceId: {
                        productId: result.id,
                        fragranceId,
                    },
                },
                create: { productId: result.id, fragranceId },
                update: {}, // do nothing if exists
            });
        }
    }
    // 4️⃣ Fetch the product again including materials & fragrances
    const finalProduct = yield client_1.prisma.product.findUnique({
        where: { id: result.id },
        include: {
            variants: true,
            category: true,
            ProductMaterial: { include: { material: true } },
            ProductFragrance: { include: { fragrance: true } },
        },
    });
    return formatProductResponse(finalProduct);
});
exports.createProduct = createProduct;
// Get All Products (Public)
const getAllProducts = (query) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f;
    const queryBuilder = new queryBuilder_1.default(query, client_1.prisma.product);
    // ✅ Category names -> categoryIds -> where categoryId IN ...
    if ((_a = query.category) === null || _a === void 0 ? void 0 : _a.length) {
        const cats = yield client_1.prisma.category.findMany({
            where: { categoryName: { in: query.category } },
            select: { id: true },
        });
        const categoryIds = cats.map(c => c.id);
        if (!categoryIds.length) {
            return { data: [], meta: { page: (_b = query.page) !== null && _b !== void 0 ? _b : 1, limit: (_c = query.limit) !== null && _c !== void 0 ? _c : 20, total: 0, totalPage: 0 } };
        }
        queryBuilder.rawFilter({ categoryId: { in: categoryIds } });
    }
    // ✅ Gender (Product.gender is string)
    if (query.gender) {
        queryBuilder.rawFilter({ gender: query.gender });
    }
    // ✅ Arrays (tags/accords/bestFor) - use hasSome
    if ((_d = query.accords) === null || _d === void 0 ? void 0 : _d.length)
        queryBuilder.rawFilter({ accords: { hasSome: query.accords } });
    if ((_e = query.bestFor) === null || _e === void 0 ? void 0 : _e.length)
        queryBuilder.rawFilter({ bestFor: { hasSome: query.bestFor } });
    if ((_f = query.tags) === null || _f === void 0 ? void 0 : _f.length)
        queryBuilder.rawFilter({ tags: { hasSome: query.tags } });
    // ✅ Price range: ProductVariant.price
    if (query.minPrice != null || query.maxPrice != null) {
        queryBuilder.rawFilter({
            variants: {
                some: {
                    price: Object.assign(Object.assign({}, (query.minPrice != null ? { gte: query.minPrice } : {})), (query.maxPrice != null ? { lte: query.maxPrice } : {})),
                },
            },
        });
    }
    // ✅ Published always
    queryBuilder.rawFilter({ published: true });
    let results = yield queryBuilder
        .search(product_constant_1.productSearchFields)
        .sort()
        .paginate()
        .include(product_constant_1.productInclude)
        .execute();
    const meta = yield queryBuilder.countTotal();
    // ✅ sortBy price requires JS sorting (since variant min-price)
    results = applySorting(results, query.sortBy);
    return { data: results.map(formatProductResponse), meta };
});
// Get All Products (Admin)
const getAllProductsAdmin = (query) => __awaiter(void 0, void 0, void 0, function* () {
    const queryBuilder = new queryBuilder_1.default(query, client_1.prisma.product);
    let results = yield queryBuilder
        .filter(product_constant_1.productFilterFields)
        .search(product_constant_1.productSearchFields)
        // .arraySearch(productArraySearchFields)
        .nestedFilter(product_constant_1.productNestedFilters)
        .sort()
        .paginate()
        .include(product_constant_1.productAdminInclude)
        .fields()
        .filterByRange(product_constant_1.productRangeFilter)
        .execute();
    const meta = yield queryBuilder.countTotal();
    // Apply stock filtering
    if (query.stock === 'in') {
        results = results.filter((product) => product.variants.some((v) => v.stock > 0));
    }
    else if (query.stock === 'out') {
        results = results.filter((product) => product.variants.every((v) => v.stock === 0));
    }
    // Apply custom sorting
    results = applySorting(results, query.sortBy);
    return {
        data: results.map(formatProductResponse),
        meta,
    };
});
// Get Single Product
const getProduct = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const product = yield client_1.prisma.product.findUnique({
        where: { id },
        include: product_constant_1.productDetailInclude,
    });
    if (!product)
        return null;
    // Get related products
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
        include: product_constant_1.productInclude,
        take: product_constant_1.QUERY_DEFAULTS.RELATED_LIMIT,
        orderBy: { salesCount: 'desc' },
    });
    const formattedProduct = formatProductResponse(product);
    return Object.assign(Object.assign({}, formattedProduct), { relatedProducts: relatedProducts.map(formatProductResponse) });
});
// Get Product By Slug
const getProductBySlug = (slug) => __awaiter(void 0, void 0, void 0, function* () {
    const product = yield client_1.prisma.product.findUnique({
        where: { slug },
        include: product_constant_1.productDetailInclude,
    });
    //   const test = await prisma.productVariant.findUnique({
    //   where: { id: "6904bfb77a035c41185d2730" },
    //   select: {
    //     discounts: {
    //       where: {
    //         AND: [
    //           { OR: [{ startDate: null }, { startDate: { lte: new Date() } }] },
    //           { OR: [{ endDate: null }, { endDate: { gte: new Date() } }] },
    //         ]
    //       }
    //     }
    //   }
    // });
    // console.log("DIRECT VARIANT TEST:", test);
    // const product = await prisma.product.findUnique({
    //   where: { slug },
    //   include: {
    //     discounts: true,
    //     variants: {
    //       include: {
    //         discounts: true,
    //       },
    //     },
    //     category: true,
    //   },
    // });
    // console.log('product', product)
    if (!product)
        return null;
    // Get related products (similar to getProduct)
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
        include: product_constant_1.productInclude,
        take: product_constant_1.QUERY_DEFAULTS.RELATED_LIMIT,
        orderBy: { salesCount: 'desc' },
    });
    const formattedProduct = formatProductResponse(product);
    return Object.assign(Object.assign({}, formattedProduct), { relatedProducts: relatedProducts.map(formatProductResponse) });
});
// Update Product
const updateProduct = (id, payload) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    // 1️⃣ Fetch existing product
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
    // 2️⃣ Check category if provided
    if (payload.categoryId) {
        const categoryExists = yield client_1.prisma.category.findUnique({
            where: { id: payload.categoryId },
        });
        if (!categoryExists) {
            throw new AppError_1.default(404, 'Category not found');
        }
    }
    // 3️⃣ Handle image updates
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
        // await Promise.all(imagesToDelete.map(deleteFile));
        yield Promise.all(imagesToDelete.map(safeDeleteCloudinary));
        const allNewImages = [...imagesToKeep, ...newImages];
        if (allNewImages.length > 0) {
            primaryImage = allNewImages[0];
            otherImages = allNewImages.slice(1);
        }
    }
    // 4️⃣ Check for duplicate SKUs if variants are being updated
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
    // 5️⃣ Update main product
    const updatedProduct = yield client_1.prisma.product.update({
        where: { id },
        data: Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, (payload.name && { name: payload.name, slug: (0, slugify_1.default)(payload.name, { lower: true, strict: true }) })), (payload.description && { description: payload.description })), (primaryImage && { primaryImage })), (otherImages && { otherImages })), (payload.videoUrl !== undefined && { videoUrl: payload.videoUrl })), (payload.tags && { tags: payload.tags })), (payload.origin !== undefined && { origin: payload.origin })), (payload.brand !== undefined && { brand: payload.brand })), (payload.gender !== undefined && { gender: payload.gender })), (payload.perfumeNotes !== undefined && { perfumeNotes: payload.perfumeNotes })), (payload.accords && { accords: payload.accords })), (payload.performance !== undefined && { performance: payload.performance })), (payload.longevity !== undefined && { longevity: payload.longevity })), (payload.projection !== undefined && { projection: payload.projection })), (payload.sillage !== undefined && { sillage: payload.sillage })), (payload.bestFor && { bestFor: payload.bestFor })), (payload.stock !== undefined && { stock: payload.stock })), (payload.categoryId && { categoryId: payload.categoryId })), (typeof payload.published === 'boolean' && { published: payload.published })),
    });
    // 6️⃣ Update variants
    if ((_b = payload.variants) === null || _b === void 0 ? void 0 : _b.length) {
        yield client_1.prisma.productVariant.deleteMany({ where: { productId: id } });
        yield client_1.prisma.productVariant.createMany({
            data: payload.variants.map(v => ({
                sku: v.sku,
                size: v.size,
                unit: client_2.Unit.ML,
                price: v.price,
                productId: id,
            })),
        });
    }
    // 7️⃣ Update Material relations using upsert
    if (payload.materialIds) {
        // Delete any material that is not in the payload
        yield client_1.prisma.productMaterial.deleteMany({
            where: { productId: id, materialId: { notIn: payload.materialIds } },
        });
        // Upsert each material
        for (const materialId of payload.materialIds) {
            yield client_1.prisma.productMaterial.upsert({
                where: {
                    productId_materialId: { productId: id, materialId },
                },
                create: { productId: id, materialId },
                update: {}, // do nothing
            });
        }
    }
    // 8️⃣ Update Fragrance relations using upsert
    if (payload.fragranceIds) {
        yield client_1.prisma.productFragrance.deleteMany({
            where: { productId: id, fragranceId: { notIn: payload.fragranceIds } },
        });
        for (const fragranceId of payload.fragranceIds) {
            yield client_1.prisma.productFragrance.upsert({
                where: {
                    productId_fragranceId: { productId: id, fragranceId },
                },
                create: { productId: id, fragranceId },
                update: {},
            });
        }
    }
    // 9️⃣ Fetch the updated product with all relations
    const finalProduct = yield client_1.prisma.product.findUnique({
        where: { id },
        include: {
            variants: true,
            category: true,
            ProductMaterial: { include: { material: true } },
            ProductFragrance: { include: { fragrance: true } },
        },
    });
    return formatProductResponse(finalProduct);
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
    // Check if product has active orders (optional business rule)
    const hasActiveOrders = yield client_1.prisma.order.findFirst({
        where: {
            productIds: { has: id }, // ✅ works on String[]
            status: { not: 'CANCEL' },
        },
    });
    if (hasActiveOrders && existingProduct.published) {
        throw new AppError_1.default(400, product_constant_1.PRODUCT_ERROR_MESSAGES.PRODUCT_PUBLISHED_CANNOT_DELETE);
    }
    // Delete related data
    yield client_1.prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
        // Delete wishlist items
        yield tx.wishlist.deleteMany({ where: { productId: id } });
        // Delete combo variants
        yield tx.comboVariant.deleteMany({ where: { productId: id } });
        // Delete reviews
        yield tx.review.deleteMany({ where: { productId: id } });
        // Delete variants
        yield tx.productVariant.deleteMany({ where: { productId: id } });
        // Delete discounts
        yield tx.discount.deleteMany({ where: { productId: id } });
        // Delete product
        yield tx.product.delete({ where: { id } });
    }));
    // Delete images from storage
    const safeDeleteCloudinary = (url) => __awaiter(void 0, void 0, void 0, function* () {
        const publicId = (0, sendImageToCloudinary_1.getPublicIdFromCloudinaryUrl)(url);
        if (!publicId)
            return;
        yield (0, sendImageToCloudinary_1.deleteFromCloudinaryByPublicId)(publicId);
    });
    const allImages = [existingProduct.primaryImage, ...existingProduct.otherImages];
    // await Promise.all(allImages.filter(Boolean).map(deleteFile));
    yield Promise.all(allImages.filter(Boolean).map(safeDeleteCloudinary));
    return { id };
});
// Get Trending Products
const getTrendingProducts = () => __awaiter(void 0, void 0, void 0, function* () {
    const threeMonthsAgo = (0, date_fns_1.subMonths)(new Date(), 3);
    const recentOrders = yield client_1.prisma.order.findMany({
        where: {
            orderTime: { gte: threeMonthsAgo },
            isPaid: true,
            status: { not: 'CANCEL' },
        },
        select: { cartItems: true },
    });
    const productSales = {};
    for (const order of recentOrders) {
        const cart = order.cartItems;
        for (const item of cart) {
            if (item === null || item === void 0 ? void 0 : item.productId) {
                productSales[item.productId] = (productSales[item.productId] || 0) + item.quantity;
            }
        }
    }
    const topProductIds = Object.entries(productSales)
        .sort((a, b) => b[1] - a[1])
        .slice(0, product_constant_1.QUERY_DEFAULTS.TRENDING_LIMIT)
        .map(([productId]) => productId);
    const trendingProducts = yield client_1.prisma.product.findMany({
        where: {
            id: { in: topProductIds },
            published: true,
        },
        include: product_constant_1.productInclude,
    });
    return trendingProducts.map((product) => (Object.assign(Object.assign({}, formatProductResponse(product)), { totalSold: productSales[product.id] || 0, trendingScore: Math.round((productSales[product.id] || 0) * 1.5) })));
});
// Get Navbar Products
const getNavbarProducts = () => __awaiter(void 0, void 0, void 0, function* () {
    const threeMonthsAgo = (0, date_fns_1.subMonths)(new Date(), 3);
    const recentOrders = yield client_1.prisma.order.findMany({
        where: {
            orderTime: { gte: threeMonthsAgo },
            isPaid: true,
            status: { not: 'CANCEL' },
        },
        select: { cartItems: true },
    });
    const productSales = {};
    for (const order of recentOrders) {
        const cart = order.cartItems;
        for (const item of cart) {
            if (item === null || item === void 0 ? void 0 : item.productId) {
                productSales[item.productId] = (productSales[item.productId] || 0) + item.quantity;
            }
        }
    }
    const products = yield client_1.prisma.product.findMany({
        where: {
            id: { in: Object.keys(productSales) },
            published: true,
        },
        include: { category: true },
    });
    const categoryWise = {};
    const overallList = [];
    for (const product of products) {
        const sold = productSales[product.id] || 0;
        const catName = product.category.categoryName;
        if (!categoryWise[catName]) {
            categoryWise[catName] = [];
        }
        categoryWise[catName].push({
            id: product.id,
            name: product.name,
            sold,
        });
        overallList.push({
            id: product.id,
            name: product.name,
            totalSold: sold,
        });
    }
    const publishedCategories = yield client_1.prisma.category.findMany({
        where: { published: true },
    });
    const trendingByCategory = {};
    for (const category of publishedCategories) {
        const catName = category.categoryName;
        const productsInCategory = categoryWise[catName] || [];
        const topProducts = productsInCategory
            .sort((a, b) => b.sold - a.sold)
            .slice(0, 3)
            .map((p) => ({
            id: p.id,
            name: p.name,
        }));
        trendingByCategory[catName] = topProducts;
    }
    const overallTrending = overallList
        .sort((a, b) => b.totalSold - a.totalSold)
        .slice(0, 3)
        .map((p) => ({
        id: p.id,
        name: p.name,
    }));
    return {
        trendingByCategory,
        overallTrending,
    };
});
// Get Featured Products
const getFeaturedProducts = () => __awaiter(void 0, void 0, void 0, function* () {
    const products = yield client_1.prisma.product.findMany({
        where: {
            published: true,
            salesCount: { gte: 10 }, // Products with good sales
        },
        include: product_constant_1.productInclude,
        orderBy: [
            { salesCount: 'desc' },
            { createdAt: 'desc' },
        ],
        take: 12,
    });
    return products.map(formatProductResponse);
});
// Get New Arrivals
const getNewArrivals = () => __awaiter(void 0, void 0, void 0, function* () {
    const cutoffDate = (0, date_fns_1.subDays)(new Date(), product_constant_1.QUERY_DEFAULTS.NEW_ARRIVALS_DAYS);
    const products = yield client_1.prisma.product.findMany({
        where: {
            published: true,
            createdAt: { gte: cutoffDate },
        },
        include: product_constant_1.productInclude,
        orderBy: { createdAt: 'desc' },
        take: 12,
    });
    return products.map(formatProductResponse);
});
// Get Products by Category
const getProductsByCategoryId = (categoryId, query) => __awaiter(void 0, void 0, void 0, function* () {
    const categoryQuery = Object.assign(Object.assign({}, query), { category: categoryId });
    const queryBuilder = new queryBuilder_1.default(categoryQuery, client_1.prisma.product);
    let results = yield queryBuilder
        .filter(product_constant_1.productFilterFields)
        .search(product_constant_1.productSearchFields)
        // .arraySearch(productArraySearchFields)
        .nestedFilter(product_constant_1.productNestedFilters)
        .sort()
        .paginate()
        .include(product_constant_1.productInclude)
        .fields()
        .filterByRange(product_constant_1.productRangeFilter)
        .rawFilter({ published: true, categoryId })
        .execute();
    const meta = yield queryBuilder.countTotal();
    // Apply custom sorting
    results = applySorting(results, query.sortBy);
    return {
        data: results.map(formatProductResponse),
        meta,
    };
});
// Get Products by Category Name ------------------(NOT WORKING)
const getProductsByCategoryName = (categoryName, query) => __awaiter(void 0, void 0, void 0, function* () {
    const categoryQuery = Object.assign(Object.assign({}, query), { category: categoryName });
    const queryBuilder = new queryBuilder_1.default(categoryQuery, client_1.prisma.product);
    let results = yield queryBuilder
        .filter(product_constant_1.productFilterFields)
        .search(product_constant_1.productSearchFields)
        // .arraySearch(productArraySearchFields)
        .nestedFilter(product_constant_1.productNestedFilters)
        .sort()
        .paginate()
        .include(product_constant_1.productInclude)
        .fields()
        .filterByRange(product_constant_1.productRangeFilter)
        .rawFilter({ published: true, categoryName })
        .execute();
    const meta = yield queryBuilder.countTotal();
    // Apply custom sorting
    results = applySorting(results, query.sortBy);
    return {
        data: results.map(formatProductResponse),
        meta,
    };
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
        // Same brand products
        client_1.prisma.product.findMany({
            where: {
                brand: product.brand,
                id: { not: productId },
                published: true,
            },
            include: product_constant_1.productInclude,
            take: 4,
            orderBy: { salesCount: 'desc' },
        }),
        // Same category products
        client_1.prisma.product.findMany({
            where: {
                categoryId: product.categoryId,
                id: { not: productId },
                published: true,
            },
            include: product_constant_1.productInclude,
            take: 4,
            orderBy: { salesCount: 'desc' },
        }),
        // Similar accords
        client_1.prisma.product.findMany({
            where: {
                accords: { hasSome: product.accords },
                id: { not: productId },
                published: true,
            },
            include: product_constant_1.productInclude,
            take: 4,
            orderBy: { salesCount: 'desc' },
        }),
    ]);
    return {
        sameBrand: sameBrand.map(formatProductResponse),
        sameCategory: sameCategory.map(formatProductResponse),
        similarAccords: similarAccords.map(formatProductResponse),
    };
});
// Search Products
const searchProducts = (query) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield getAllProducts(query);
    // Get available filters
    const [brands, categories, priceRange, origins, accords] = yield Promise.all([
        client_1.prisma.product.findMany({
            where: { published: true, brand: { not: null } },
            select: { brand: true },
            distinct: ['brand'],
        }),
        client_1.prisma.category.findMany({
            where: { published: true },
            select: { id: true, categoryName: true },
        }),
        client_1.prisma.productVariant.aggregate({
            _min: { price: true },
            _max: { price: true },
        }),
        client_1.prisma.product.findMany({
            where: { published: true, origin: { not: null } },
            select: { origin: true },
            distinct: ['origin'],
        }),
        client_1.prisma.product.findMany({
            where: { published: true },
            select: { accords: true },
        }),
    ]);
    const uniqueAccords = [...new Set(accords.flatMap(p => p.accords))];
    return Object.assign(Object.assign({}, result), { filters: {
            brands: brands.map(b => b.brand).filter(Boolean),
            categories: categories.map(c => ({ id: c.id, name: c.categoryName })),
            priceRange: {
                min: priceRange._min.price || 0,
                max: priceRange._max.price || 0,
            },
            origins: origins.map(o => o.origin).filter(Boolean),
            accords: uniqueAccords,
        }, meta: Object.assign(Object.assign({}, result.meta), { totalPages: result.meta.totalPage }) });
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
// Update Variant Stock
// const updateVariantStock = async (variantId: string, newStock: number, reason?: string) => {
//   const variant = await prisma.productVariant.findUnique({
//     where: { id: variantId },
//   });
//   if (!variant) {
//     throw new AppError(404, PRODUCT_ERROR_MESSAGES.VARIANT_NOT_FOUND);
//   }
//   const updatedVariant = await prisma.productVariant.update({
//     where: { id: variantId },
//     data: { stock: newStock },
//   });
//   // Optional: Log stock change for audit trail
//   // You can create a StockLog model for this
//   return updatedVariant;
// };
// Update Product Stock
// const updateProductStock = async (productId: string, addedStock: number, reason?: string) => {
//   const product = await prisma.product.findUnique({
//     where: { id: productId },
//   });
//   if (!product) {
//     throw new AppError(404, PRODUCT_ERROR_MESSAGES.PRODUCT_NOT_FOUND);
//   }
//   const newTotalStock = (product.stock ?? 0) + addedStock;
//   const updatedProduct = await prisma.product.update({
//     where: { id: productId },
//     data: {
//       stock: newTotalStock,
//     },
//   });
// 🔥 Optional: create a StockLog entry for auditing
// await prisma.stockLog.create({
//   data: {
//     productId,
//     change: addedStock,
//     newStock: newTotalStock,
//     reason: reason || "Stock updated",
//   },
// });
//   return updatedProduct;
// };
// Get Product Analytics
const getProductAnalytics = () => __awaiter(void 0, void 0, void 0, function* () {
    const [totalProducts, publishedProducts, totalVariants, priceStats, categoryStats, brandStats, stockStats,] = yield Promise.all([
        client_1.prisma.product.count(),
        client_1.prisma.product.count({ where: { published: true } }),
        client_1.prisma.productVariant.count(),
        client_1.prisma.productVariant.aggregate({
            _avg: { price: true },
            _sum: { price: true },
        }),
        client_1.prisma.product.groupBy({
            by: ['categoryId'],
            _count: { _all: true },
            where: { published: true },
        }),
        client_1.prisma.product.groupBy({
            by: ['brand'],
            _count: { _all: true },
            where: { published: true, brand: { not: null } },
        }),
        // prisma.productVariant.aggregate({
        //   where: { stock: { lte: QUERY_DEFAULTS.LOW_STOCK_THRESHOLD } },
        //   _count: { _all: true },
        // }),
        client_1.prisma.product.aggregate({
            where: { stock: { lte: product_constant_1.QUERY_DEFAULTS.LOW_STOCK_THRESHOLD } },
            _count: { _all: true },
        }),
    ]);
    // Get category names
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
    // const outOfStockCount = await prisma.productVariant.count({
    //   where: { stock: 0 },
    // });
    const outOfStockCount = yield client_1.prisma.product.count({
        where: { stock: 0 },
    });
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
// const getLowStockProducts = async (threshold: number = QUERY_DEFAULTS.LOW_STOCK_THRESHOLD) => {
//   const products = await prisma.product.findMany({
//     where: {
//       variants: {
//         some: {
//           stock: { lte: threshold },
//         },
//       },
//     },
//     include: {
//       variants: {
//         where: { stock: { lte: threshold } },
//       },
//       category: { select: { categoryName: true } },
//     },
//     orderBy: { name: 'asc' },
//   });
//   return products.map(product => ({
//     id: product.id,
//     name: product.name,
//     category: product.category.categoryName,
//     lowStockVariants: product.variants.map(v => ({
//       id: v.id,
//       sku: v.sku,
//       size: v.size,
//       unit: v.unit,
//       stock: v.stock,
//     })),
//   }));
// };
// Get Low Stock Products
const getLowStockProducts = (...args_1) => __awaiter(void 0, [...args_1], void 0, function* (threshold = product_constant_1.QUERY_DEFAULTS.LOW_STOCK_THRESHOLD) {
    const products = yield client_1.prisma.product.findMany({
        where: {
            stock: { lte: threshold }, // check stock on product
        },
        include: {
            variants: true, // include variants for display
            category: { select: { categoryName: true } },
        },
        orderBy: { name: 'asc' },
    });
    return products.map(product => ({
        id: product.id,
        name: product.name,
        category: product.category.categoryName,
        stock: product.stock, // product-level stock
        variants: product.variants.map(v => ({
            id: v.id,
            sku: v.sku,
            size: v.size,
            unit: v.unit,
            price: v.price,
            // discount: v.discount,
        })),
    }));
});
// Get Bestsellers
const getBestsellers = () => __awaiter(void 0, void 0, void 0, function* () {
    const products = yield client_1.prisma.product.findMany({
        where: { published: true },
        include: product_constant_1.productInclude,
        orderBy: { salesCount: 'desc' },
        take: 20,
    });
    return products.map((product, index) => (Object.assign(Object.assign({}, formatProductResponse(product)), { totalSold: product.salesCount, trendingScore: 100 - index })));
});
// Update Product Stock
const updateProductStock = (productId, addedStock, reason) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const product = yield client_1.prisma.product.findUnique({
        where: { id: productId },
    });
    if (!product) {
        throw new AppError_1.default(404, product_constant_1.PRODUCT_ERROR_MESSAGES.PRODUCT_NOT_FOUND);
    }
    const newTotalStock = ((_a = product.stock) !== null && _a !== void 0 ? _a : 0) + addedStock;
    // const updatedProduct = await prisma.$transaction(async (tx) => {
    //   // Update product stock
    //   const updated = await tx.product.update({
    //     where: { id: productId },
    //     data: {
    //       stock: newTotalStock,
    //     },
    //     include: productAdminInclude,
    //   });
    // 1️⃣ Update stock and create log inside transaction
    yield client_1.prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
        yield tx.product.update({
            where: { id: productId },
            data: { stock: newTotalStock },
        });
        yield tx.stockLog.create({
            data: { productId, change: addedStock, reason: reason || 'Stock updated', createdAt: new Date() },
        });
    }));
    // 2️⃣ Fetch full product after transaction
    const updatedProduct = yield client_1.prisma.product.findUnique({
        where: { id: productId },
        include: product_constant_1.productAdminInclude,
    });
    return formatProductResponse(updatedProduct);
});
// Get Stock Logs
const getStockLogs = (productId) => __awaiter(void 0, void 0, void 0, function* () {
    const product = yield client_1.prisma.product.findUnique({
        where: { id: productId },
    });
    if (!product) {
        throw new AppError_1.default(404, product_constant_1.PRODUCT_ERROR_MESSAGES.PRODUCT_NOT_FOUND);
    }
    const logs = yield client_1.prisma.stockLog.findMany({
        where: { productId },
        include: {
            product: { select: { name: true } },
        },
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
// Helper Functions
const formatProductResponse = (product) => {
    var _a, _b;
    const variants = product.variants || [];
    const prices = variants.map((v) => v.price);
    const reviews = product.Review || [];
    // Calculate average rating and review count
    const reviewCount = reviews.length;
    const averageRating = reviewCount > 0
        ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount
        : 0;
    return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        description: product.description,
        primaryImage: product.primaryImage,
        otherImages: product.otherImages || [],
        videoUrl: product.videoUrl,
        tags: product.tags || [],
        salesCount: product.salesCount,
        published: product.published,
        // Perfume specifications
        origin: product.origin,
        brand: product.brand,
        gender: product.gender,
        perfumeNotes: product.perfumeNotes,
        accords: product.accords || [],
        performance: product.performance,
        longevity: product.longevity,
        projection: product.projection,
        sillage: product.sillage,
        bestFor: product.bestFor || [],
        categoryId: product.categoryId,
        category: product.category,
        // Map material/fragrance IDs
        materialIds: ((_a = product.ProductMaterial) === null || _a === void 0 ? void 0 : _a.map((pm) => pm.material.id)) || [],
        fragranceIds: ((_b = product.ProductFragrance) === null || _b === void 0 ? void 0 : _b.map((pf) => pf.fragrance.id)) || [],
        supplier: product.supplier,
        variants: variants,
        // Computed fields
        minPrice: prices.length > 0 ? Math.min(...prices) : 0,
        maxPrice: prices.length > 0 ? Math.max(...prices) : 0,
        totalStock: product.stock,
        inStock: product.stock > 0,
        // Review fields
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
        averageRating: parseFloat(averageRating.toFixed(2)),
        reviewCount,
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
            const avgA = a.Reviews && a.Reviews.length > 0
                ? a.Reviews.reduce((sum, r) => sum + r.rating, 0) / a.Reviews.length
                : 0;
            const avgB = b.Reviews && b.Reviews.length > 0
                ? b.Reviews.reduce((sum, r) => sum + r.rating, 0) / b.Reviews.length
                : 0;
            return avgA - avgB;
        });
    }
    else if (sortBy === 'rating_desc') {
        return results.sort((a, b) => {
            const avgA = a.Reviews && a.Reviews.length > 0
                ? a.Reviews.reduce((sum, r) => sum + r.rating, 0) / a.Reviews.length
                : 0;
            const avgB = b.Reviews && b.Reviews.length > 0
                ? b.Reviews.reduce((sum, r) => sum + r.rating, 0) / b.Reviews.length
                : 0;
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
    // updateVariantStock,
    getProductAnalytics,
    getLowStockProducts,
    getBestsellers,
    updateProductStock,
    getStockLogs,
};
