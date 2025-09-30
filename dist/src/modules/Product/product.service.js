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
exports.ProductServices = void 0;
const date_fns_1 = require("date-fns");
const client_1 = require("../../../prisma/client");
const AppError_1 = __importDefault(require("../../errors/AppError"));
const fileDelete_1 = require("../../helpers/fileDelete");
const queryBuilder_1 = __importDefault(require("../../helpers/queryBuilder"));
const product_constant_1 = require("./product.constant");
// Create Product
const createProduct = (payload) => __awaiter(void 0, void 0, void 0, function* () {
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
    const result = yield client_1.prisma.product.create({
        data: {
            name: payload.name,
            description: payload.description,
            primaryImage: payload.primaryImage,
            otherImages: payload.otherImages || [],
            videoUrl: payload.videoUrl,
            tags: payload.tags,
            // Perfume specifications
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
            materialId: payload.materialId,
            categoryId: payload.categoryId,
            published: payload.published,
            variants: {
                create: payload.variants.map((variant) => ({
                    sku: variant.sku,
                    unit: variant.unit,
                    size: variant.size,
                    price: variant.price,
                    stock: variant.stock,
                })),
            },
        },
        include: product_constant_1.productInclude,
    });
    return formatProductResponse(result);
});
// Get All Products (Public)
const getAllProducts = (query) => __awaiter(void 0, void 0, void 0, function* () {
    const queryBuilder = new queryBuilder_1.default(query, client_1.prisma.product);
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
        .rawFilter({ published: true })
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
// Update Product
const updateProduct = (id, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const existingProduct = yield client_1.prisma.product.findUnique({
        where: { id },
        include: { variants: true },
    });
    if (!existingProduct) {
        throw new AppError_1.default(404, product_constant_1.PRODUCT_ERROR_MESSAGES.NOT_FOUND);
    }
    // Handle image updates
    let primaryImage = existingProduct.primaryImage;
    let otherImages = existingProduct.otherImages;
    if (payload.imagesToKeep || payload.newImages) {
        const imagesToKeep = payload.imagesToKeep || [];
        const newImages = payload.newImages || [];
        // Determine images to delete
        const currentImages = [existingProduct.primaryImage, ...existingProduct.otherImages];
        const imagesToDelete = currentImages.filter(img => img && !imagesToKeep.includes(img) && !newImages.includes(img));
        // Delete unused images
        yield Promise.all(imagesToDelete.map(fileDelete_1.deleteFile));
        // Set new image structure
        const allNewImages = [...imagesToKeep, ...newImages];
        if (allNewImages.length > 0) {
            primaryImage = allNewImages[0];
            otherImages = allNewImages.slice(1);
        }
    }
    // Check for duplicate SKUs if variants are being updated
    if (payload.variants) {
        const existingSKUs = yield client_1.prisma.productVariant.findMany({
            where: {
                sku: { in: payload.variants.map(v => v.sku) },
                productId: { not: id }
            },
            select: { sku: true },
        });
        if (existingSKUs.length > 0) {
            throw new AppError_1.default(400, `SKU already exists: ${existingSKUs.map(s => s.sku).join(', ')}`);
        }
    }
    // Update product
    const updatedProduct = yield client_1.prisma.product.update({
        where: { id },
        data: Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, (payload.name && { name: payload.name })), (payload.description && { description: payload.description })), (primaryImage && { primaryImage })), (otherImages && { otherImages })), (payload.videoUrl !== undefined && { videoUrl: payload.videoUrl })), (payload.tags && { tags: payload.tags })), (payload.origin !== undefined && { origin: payload.origin })), (payload.brand !== undefined && { brand: payload.brand })), (payload.gender !== undefined && { gender: payload.gender })), (payload.perfumeNotes !== undefined && { perfumeNotes: payload.perfumeNotes })), (payload.accords && { accords: payload.accords })), (payload.performance !== undefined && { performance: payload.performance })), (payload.longevity !== undefined && { longevity: payload.longevity })), (payload.projection !== undefined && { projection: payload.projection })), (payload.sillage !== undefined && { sillage: payload.sillage })), (payload.bestFor && { bestFor: payload.bestFor })), (payload.materialId && { materialId: payload.materialId })), (payload.categoryId && { categoryId: payload.categoryId })), (typeof payload.published === 'boolean' && { published: payload.published })),
        include: product_constant_1.productInclude,
    });
    // Replace variants if provided
    if (payload.variants) {
        yield client_1.prisma.productVariant.deleteMany({ where: { productId: id } });
        yield client_1.prisma.productVariant.createMany({
            data: payload.variants.map((variant) => (Object.assign(Object.assign({}, variant), { productId: id }))),
        });
    }
    // Fetch updated product with variants
    const result = yield client_1.prisma.product.findUnique({
        where: { id },
        include: product_constant_1.productInclude,
    });
    return formatProductResponse(result);
});
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
            cartItems: {
                path: '$[*].productId',
                equals: id,
            },
            status: { not: 'CANCEL' },
        },
    });
    if (hasActiveOrders && existingProduct.published) {
        throw new AppError_1.default(400, product_constant_1.PRODUCT_ERROR_MESSAGES.PRODUCT_PUBLISHED_CANNOT_DELETE);
    }
    // Delete related data
    yield client_1.prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
        // Delete wishlist items
        yield tx.wishlist.deleteMany({ where: { variant: { productId: id } } });
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
    const allImages = [existingProduct.primaryImage, ...existingProduct.otherImages];
    yield Promise.all(allImages.filter(Boolean).map(fileDelete_1.deleteFile));
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
const getProductsByCategory = (categoryId, query) => __awaiter(void 0, void 0, void 0, function* () {
    const categoryQuery = Object.assign(Object.assign({}, query), { category: categoryId });
    const queryBuilder = new queryBuilder_1.default(categoryQuery, client_1.prisma.product);
    let results = yield queryBuilder
        .filter(product_constant_1.productFilterFields)
        .search(product_constant_1.productSearchFields)
        .arraySearch(product_constant_1.productArraySearchFields)
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
        } });
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
const updateVariantStock = (variantId, newStock, reason) => __awaiter(void 0, void 0, void 0, function* () {
    const variant = yield client_1.prisma.productVariant.findUnique({
        where: { id: variantId },
    });
    if (!variant) {
        throw new AppError_1.default(404, product_constant_1.PRODUCT_ERROR_MESSAGES.VARIANT_NOT_FOUND);
    }
    const updatedVariant = yield client_1.prisma.productVariant.update({
        where: { id: variantId },
        data: { stock: newStock },
    });
    // Optional: Log stock change for audit trail
    // You can create a StockLog model for this
    return updatedVariant;
});
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
        client_1.prisma.productVariant.aggregate({
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
    const outOfStockCount = yield client_1.prisma.productVariant.count({
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
const getLowStockProducts = (...args_1) => __awaiter(void 0, [...args_1], void 0, function* (threshold = product_constant_1.QUERY_DEFAULTS.LOW_STOCK_THRESHOLD) {
    const products = yield client_1.prisma.product.findMany({
        where: {
            variants: {
                some: {
                    stock: { lte: threshold },
                },
            },
        },
        include: {
            variants: {
                where: { stock: { lte: threshold } },
            },
            category: { select: { categoryName: true } },
        },
        orderBy: { name: 'asc' },
    });
    return products.map(product => ({
        id: product.id,
        name: product.name,
        category: product.category.categoryName,
        lowStockVariants: product.variants.map(v => ({
            id: v.id,
            sku: v.sku,
            size: v.size,
            unit: v.unit,
            stock: v.stock,
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
// Helper Functions
const formatProductResponse = (product) => {
    const variants = product.variants || [];
    const prices = variants.map((v) => v.price);
    const stocks = variants.map((v) => v.stock);
    return {
        id: product.id,
        name: product.name,
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
        materialId: product.materialId,
        categoryId: product.categoryId,
        category: product.category,
        variants: variants,
        // Computed fields
        minPrice: prices.length > 0 ? Math.min(...prices) : 0,
        maxPrice: prices.length > 0 ? Math.max(...prices) : 0,
        totalStock: stocks.reduce((sum, stock) => sum + stock, 0),
        inStock: stocks.some((stock) => stock > 0),
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
    return results;
};
exports.ProductServices = {
    createProduct,
    getAllProducts,
    getAllProductsAdmin,
    getProduct,
    updateProduct,
    deleteProduct,
    getTrendingProducts,
    getNavbarProducts,
    getFeaturedProducts,
    getNewArrivals,
    getProductsByCategory,
    getRelatedProducts,
    searchProducts,
    getProductVariants,
    updateVariantStock,
    getProductAnalytics,
    getLowStockProducts,
    getBestsellers,
};
