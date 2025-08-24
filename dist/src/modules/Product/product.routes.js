"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductRoutes = void 0;
const express_1 = require("express");
const product_controller_1 = require("./product.controller");
const auth_1 = __importDefault(require("../../middlewares/auth"));
const fileUploader_1 = require("../../helpers/fileUploader");
const validateRequest_1 = __importDefault(require("../../middlewares/validateRequest"));
const product_validation_1 = require("../../validations/product.validation");
const router = (0, express_1.Router)();
// Product CRUD Operations
router.post('/create-product', (0, auth_1.default)('ADMIN'), fileUploader_1.upload.array('images', 10), // Max 10 images
(0, validateRequest_1.default)(product_validation_1.ProductValidation.createProductZodSchema), product_controller_1.ProductController.createProduct);
router.get('/get-all-products', product_controller_1.ProductController.getAllProducts);
router.get('/get-all-products/admin', (0, auth_1.default)('ADMIN'), product_controller_1.ProductController.getAllProductsAdmin);
router.get('/get-product/:id', product_controller_1.ProductController.getProduct);
router.patch('/update-product/:id', (0, auth_1.default)('ADMIN'), fileUploader_1.upload.array('images', 10), (0, validateRequest_1.default)(product_validation_1.ProductValidation.updateProductZodSchema), product_controller_1.ProductController.updateProduct);
router.delete('/delete-product/:id', (0, auth_1.default)('ADMIN'), product_controller_1.ProductController.deleteProduct);
// Business Logic Routes
router.get('/get-trending-products', product_controller_1.ProductController.getTrendingProducts);
router.get('/get-navbar-products', product_controller_1.ProductController.getNavbarProducts);
router.get('/get-featured-products', product_controller_1.ProductController.getFeaturedProducts);
router.get('/get-new-arrivals', product_controller_1.ProductController.getNewArrivals);
router.get('/get-products-by-category/:categoryId', product_controller_1.ProductController.getProductsByCategory);
router.get('/get-related-products/:productId', product_controller_1.ProductController.getRelatedProducts);
router.get('/search-products', product_controller_1.ProductController.searchProducts);
// Product Variants Routes
router.get('/get-product-variants/:productId', product_controller_1.ProductController.getProductVariants);
router.patch('/update-variant-stock/:variantId', (0, auth_1.default)('ADMIN'), product_controller_1.ProductController.updateVariantStock);
// Product Analytics Routes
router.get('/get-product-analytics', (0, auth_1.default)('ADMIN'), product_controller_1.ProductController.getProductAnalytics);
router.get('/get-low-stock-products', (0, auth_1.default)('ADMIN'), product_controller_1.ProductController.getLowStockProducts);
router.get('/get-bestsellers', product_controller_1.ProductController.getBestsellers);
exports.ProductRoutes = router;
