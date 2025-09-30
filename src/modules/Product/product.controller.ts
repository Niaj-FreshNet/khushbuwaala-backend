import httpStatus from 'http-status';
import AppError from '../../errors/AppError';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { ProductServices } from './product.service';
import { IProduct, IUpdateProduct } from './product.interface';
import { PRODUCT_ERROR_MESSAGES } from './product.constant';

// Create Product
const createProduct = catchAsync(async (req, res) => {
  const { categoryId, materialId, variants } = req.body;

  // Validation
  if (!categoryId) {
    throw new AppError(httpStatus.BAD_REQUEST, PRODUCT_ERROR_MESSAGES.CATEGORY_REQUIRED);
  }

  // Image handling
  if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
    throw new AppError(httpStatus.BAD_REQUEST, PRODUCT_ERROR_MESSAGES.IMAGE_REQUIRED);
  }

  const uploadedFiles = req.files as Express.Multer.File[];
  const imageUrls = uploadedFiles.map(
    (file) => `${process.env.BACKEND_LIVE_URL}/uploads/${file.filename}`
  );

  // Parse data
  const parsedData = {
    ...req.body,
    primaryImage: imageUrls[0],
    otherImages: imageUrls.slice(1),
    published: req.body.published === 'true',
    tags: typeof req.body.tags === 'string' ? req.body.tags.split(',') : req.body.tags || [],
    accords: typeof req.body.accords === 'string' ? req.body.accords.split(',') : req.body.accords || [],
    bestFor: typeof req.body.bestFor === 'string' ? req.body.bestFor.split(',') : req.body.bestFor || [],
    perfumeNotes: req.body.perfumeNotes ? JSON.parse(req.body.perfumeNotes) : undefined,
    variants: typeof variants === 'string' ? JSON.parse(variants) : variants,
  };

  const result = await ProductServices.createProduct(parsedData as IProduct);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Product created successfully',
    data: result,
  });
});

// Get All Products (Public)
const getAllProducts = catchAsync(async (req, res) => {
  const result = await ProductServices.getAllProducts(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Products retrieved successfully',
    meta: result.meta,
    data: result.data,
  });
});

// Get All Products (Admin)
const getAllProductsAdmin = catchAsync(async (req, res) => {
  const result = await ProductServices.getAllProductsAdmin(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Products retrieved successfully',
    meta: result.meta,
    data: result.data,
  });
});

// Get Single Product
const getProduct = catchAsync(async (req, res) => {
  const { id } = req.params;
  const result = await ProductServices.getProduct(id);

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, PRODUCT_ERROR_MESSAGES.NOT_FOUND);
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Product retrieved successfully',
    data: result,
  });
});

// Update Product
const updateProduct = catchAsync(async (req, res) => {
  const { id } = req.params;

  // Handle new images
  let newImageUrls: string[] = [];
  if (req.files && Array.isArray(req.files)) {
    const uploadedFiles = req.files as Express.Multer.File[];
    newImageUrls = uploadedFiles.map(
      (file) => `${process.env.BACKEND_LIVE_URL}/uploads/${file.filename}`
    );
  }

  // Parse data
  const parsedData = {
    ...req.body,
    published: req.body.published === 'true' ? true : req.body.published === 'false' ? false : undefined,
    tags: typeof req.body.tags === 'string' ? req.body.tags.split(',') : req.body.tags,
    accords: typeof req.body.accords === 'string' ? req.body.accords.split(',') : req.body.accords,
    bestFor: typeof req.body.bestFor === 'string' ? req.body.bestFor.split(',') : req.body.bestFor,
    perfumeNotes: req.body.perfumeNotes ? JSON.parse(req.body.perfumeNotes) : undefined,
    variants: typeof req.body.variants === 'string' ? JSON.parse(req.body.variants) : req.body.variants,
    imagesToKeep: req.body.imagesToKeep ? 
      typeof req.body.imagesToKeep === 'string' ? JSON.parse(req.body.imagesToKeep) : req.body.imagesToKeep : [],
    newImages: newImageUrls,
  };

  const result = await ProductServices.updateProduct(id, parsedData as IUpdateProduct);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Product updated successfully',
    data: result,
  });
});

// Delete Product
const deleteProduct = catchAsync(async (req, res) => {
  const { id } = req.params;
  const result = await ProductServices.deleteProduct(id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Product deleted successfully',
    data: result,
  });
});

// Get Trending Products
const getTrendingProducts = catchAsync(async (req, res) => {
  const result = await ProductServices.getTrendingProducts();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Trending products retrieved successfully',
    data: result,
  });
});

// Get Navbar Products
const getNavbarProducts = catchAsync(async (req, res) => {
  const result = await ProductServices.getNavbarProducts();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Navbar products retrieved successfully',
    data: result,
  });
});

// Get Featured Products
const getFeaturedProducts = catchAsync(async (req, res) => {
  const result = await ProductServices.getFeaturedProducts();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Featured products retrieved successfully',
    data: result,
  });
});

// Get New Arrivals
const getNewArrivals = catchAsync(async (req, res) => {
  const result = await ProductServices.getNewArrivals();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'New arrivals retrieved successfully',
    data: result,
  });
});

// Get Products by Category
const getProductsByCategory = catchAsync(async (req, res) => {
  const { categoryId } = req.params;
  const result = await ProductServices.getProductsByCategory(categoryId, req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Category products retrieved successfully',
    meta: result.meta,
    data: result.data,
  });
});

// Get Related Products
const getRelatedProducts = catchAsync(async (req, res) => {
  const { productId } = req.params;
  const result = await ProductServices.getRelatedProducts(productId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Related products retrieved successfully',
    data: result,
  });
});

// Search Products
const searchProducts = catchAsync(async (req, res) => {
  const result = await ProductServices.searchProducts(req.query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Products search completed successfully',
    meta: result.meta,
    data: result.data,
    filters: result.filters,
  });
});

// Get Product Variants
const getProductVariants = catchAsync(async (req, res) => {
  const { productId } = req.params;
  const result = await ProductServices.getProductVariants(productId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Product variants retrieved successfully',
    data: result,
  });
});

// Update Variant Stock
const updateVariantStock = catchAsync(async (req, res) => {
  const { variantId } = req.params;
  const { newStock, reason } = req.body;

  const result = await ProductServices.updateVariantStock(variantId, newStock, reason);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Variant stock updated successfully',
    data: result,
  });
});

// Get Product Analytics
const getProductAnalytics = catchAsync(async (req, res) => {
  const result = await ProductServices.getProductAnalytics();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Product analytics retrieved successfully',
    data: result,
  });
});

// Get Low Stock Products
const getLowStockProducts = catchAsync(async (req, res) => {
  const threshold = parseInt(req.query.threshold as string) || 10;
  const result = await ProductServices.getLowStockProducts(threshold);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Low stock products retrieved successfully',
    data: result,
  });
});

// Get Bestsellers
const getBestsellers = catchAsync(async (req, res) => {
  const result = await ProductServices.getBestsellers();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Bestsellers retrieved successfully',
    data: result,
  });
});


export const ProductController = {
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