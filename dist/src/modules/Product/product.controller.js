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
exports.ProductController = void 0;
const http_status_1 = __importDefault(require("http-status"));
const AppError_1 = __importDefault(require("../../errors/AppError"));
const catchAsync_1 = __importDefault(require("../../utils/catchAsync"));
const sendResponse_1 = __importDefault(require("../../utils/sendResponse"));
const product_service_1 = require("./product.service");
const product_constant_1 = require("./product.constant");
// Create Product
const createProduct = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { categoryId, variants } = req.body;
    // Validation
    if (!categoryId) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, product_constant_1.PRODUCT_ERROR_MESSAGES.CATEGORY_REQUIRED);
    }
    // Image handling
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, product_constant_1.PRODUCT_ERROR_MESSAGES.IMAGE_REQUIRED);
    }
    const uploadedFiles = req.files;
    const imageUrls = uploadedFiles.map((file) => `${process.env.BACKEND_LIVE_URL}/uploads/${file.filename}`);
    // Parse data
    const parsedData = Object.assign(Object.assign({}, req.body), { primaryImage: imageUrls[0], otherImages: imageUrls.slice(1), published: req.body.published === 'true', tags: typeof req.body.tags === 'string' ? req.body.tags.split(',') : req.body.tags || [], accords: typeof req.body.accords === 'string' ? req.body.accords.split(',') : req.body.accords || [], bestFor: typeof req.body.bestFor === 'string' ? req.body.bestFor.split(',') : req.body.bestFor || [], perfumeNotes: req.body.perfumeNotes ? JSON.parse(req.body.perfumeNotes) : undefined, variants: typeof variants === 'string' ? JSON.parse(variants) : variants });
    const result = yield product_service_1.ProductServices.createProduct(parsedData);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.CREATED,
        success: true,
        message: 'Product created successfully',
        data: result,
    });
}));
// Get All Products (Public)
const getAllProducts = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield product_service_1.ProductServices.getAllProducts(req.query);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Products retrieved successfully',
        meta: result.meta,
        data: result.data,
    });
}));
// Get All Products (Admin)
const getAllProductsAdmin = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield product_service_1.ProductServices.getAllProductsAdmin(req.query);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Products retrieved successfully',
        meta: result.meta,
        data: result.data,
    });
}));
// Get Single Product
const getProduct = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const result = yield product_service_1.ProductServices.getProduct(id);
    if (!result) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, product_constant_1.PRODUCT_ERROR_MESSAGES.NOT_FOUND);
    }
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Product retrieved successfully',
        data: result,
    });
}));
// Update Product
const updateProduct = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    // Handle new images
    let newImageUrls = [];
    if (req.files && Array.isArray(req.files)) {
        const uploadedFiles = req.files;
        newImageUrls = uploadedFiles.map((file) => `${process.env.BACKEND_LIVE_URL}/uploads/${file.filename}`);
    }
    // Parse data
    const parsedData = Object.assign(Object.assign({}, req.body), { published: req.body.published === 'true' ? true : req.body.published === 'false' ? false : undefined, tags: typeof req.body.tags === 'string' ? req.body.tags.split(',') : req.body.tags, accords: typeof req.body.accords === 'string' ? req.body.accords.split(',') : req.body.accords, bestFor: typeof req.body.bestFor === 'string' ? req.body.bestFor.split(',') : req.body.bestFor, perfumeNotes: req.body.perfumeNotes ? JSON.parse(req.body.perfumeNotes) : undefined, variants: typeof req.body.variants === 'string' ? JSON.parse(req.body.variants) : req.body.variants, imagesToKeep: req.body.imagesToKeep ?
            typeof req.body.imagesToKeep === 'string' ? JSON.parse(req.body.imagesToKeep) : req.body.imagesToKeep : [], newImages: newImageUrls });
    const result = yield product_service_1.ProductServices.updateProduct(id, parsedData);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Product updated successfully',
        data: result,
    });
}));
// Delete Product
const deleteProduct = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const result = yield product_service_1.ProductServices.deleteProduct(id);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Product deleted successfully',
        data: result,
    });
}));
// Get Trending Products
const getTrendingProducts = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield product_service_1.ProductServices.getTrendingProducts();
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Trending products retrieved successfully',
        data: result,
    });
}));
// Get Navbar Products
const getNavbarProducts = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield product_service_1.ProductServices.getNavbarProducts();
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Navbar products retrieved successfully',
        data: result,
    });
}));
// Get Featured Products
const getFeaturedProducts = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield product_service_1.ProductServices.getFeaturedProducts();
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Featured products retrieved successfully',
        data: result,
    });
}));
// Get New Arrivals
const getNewArrivals = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield product_service_1.ProductServices.getNewArrivals();
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'New arrivals retrieved successfully',
        data: result,
    });
}));
// Get Products by Category
const getProductsByCategory = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { categoryId } = req.params;
    const result = yield product_service_1.ProductServices.getProductsByCategory(categoryId, req.query);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Category products retrieved successfully',
        meta: result.meta,
        data: result.data,
    });
}));
// Get Related Products
const getRelatedProducts = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { productId } = req.params;
    const result = yield product_service_1.ProductServices.getRelatedProducts(productId);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Related products retrieved successfully',
        data: result,
    });
}));
// Search Products
const searchProducts = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield product_service_1.ProductServices.searchProducts(req.query);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Products search completed successfully',
        meta: result.meta,
        data: result.data,
        filters: result.filters,
    });
}));
// Get Product Variants
const getProductVariants = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { productId } = req.params;
    const result = yield product_service_1.ProductServices.getProductVariants(productId);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Product variants retrieved successfully',
        data: result,
    });
}));
// Update Variant Stock
const updateVariantStock = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { variantId } = req.params;
    const { newStock, reason } = req.body;
    const result = yield product_service_1.ProductServices.updateVariantStock(variantId, newStock, reason);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Variant stock updated successfully',
        data: result,
    });
}));
// Get Product Analytics
const getProductAnalytics = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield product_service_1.ProductServices.getProductAnalytics();
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Product analytics retrieved successfully',
        data: result,
    });
}));
// Get Low Stock Products
const getLowStockProducts = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const threshold = parseInt(req.query.threshold) || 10;
    const result = yield product_service_1.ProductServices.getLowStockProducts(threshold);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Low stock products retrieved successfully',
        data: result,
    });
}));
// Get Bestsellers
const getBestsellers = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield product_service_1.ProductServices.getBestsellers();
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Bestsellers retrieved successfully',
        data: result,
    });
}));
exports.ProductController = {
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
