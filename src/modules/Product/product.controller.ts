import httpStatus from 'http-status';
import AppError from '../../errors/AppError';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { ProductServices } from './product.service';
import { FinanceServices } from '../Finance/finance.service';
import { IProduct, IUpdateProduct } from './product.interface';
import { PRODUCT_ERROR_MESSAGES } from './product.constant';
import { parseProductQuery } from '../../helpers/queryBuilder';
import { uploadToCloudinary } from '../../utils/sendImageToCloudinary';

// Create Product
const createProduct = catchAsync(async (req, res) => {
  const { categoryId, variants } = req.body;

  // Validation
  if (!categoryId) {
    throw new AppError(httpStatus.BAD_REQUEST, PRODUCT_ERROR_MESSAGES.CATEGORY_REQUIRED);
  }

  const { primaryImage } = req.body;
  if (!primaryImage) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Primary image is required.');
  }

  // Image handling
  // if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
  //   throw new AppError(httpStatus.BAD_REQUEST, PRODUCT_ERROR_MESSAGES.IMAGE_REQUIRED);
  // }

  // const uploadedFiles = req.files as Express.Multer.File[];
  // const imageUrls = uploadedFiles.map(
  //   (file) => `${process.env.BACKEND_LIVE_URL}/uploads/${file.filename}`
  // );

  // Parse data
  const parsedData = {
    ...req.body,
    // primaryImage: imageUrls[0],
    // otherImages: imageUrls.slice(1),
    published: req.body.published === true || req.body.published === 'true',
    tags: req.body.tags || [],
    accords: req.body.accords || [],
    bestFor: req.body.bestFor || [],
    perfumeNotes: req.body.perfumeNotes,
    stock: req.body.stock,
    variants: variants,
  };

  const isSuperAdmin = req.user?.role === 'SUPER_ADMIN';
  const result = await ProductServices.createProduct(parsedData as IProduct, isSuperAdmin);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Product created successfully',
    data: result,
  });
});

// Get All Products (Public)
const getAllProducts = catchAsync(async (req, res) => {
  const query = parseProductQuery(req.query);

  const result = await ProductServices.getAllProducts(query);

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
  const query = parseProductQuery(req.query);
  const isSuperAdmin = req.user?.role === 'SUPER_ADMIN';

  const result = await ProductServices.getAllProductsAdmin(query, isSuperAdmin);

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
  const role = req.user?.role;
  const isSuperAdmin = role === 'SUPER_ADMIN';
  const isStaff = role === 'ADMIN' || role === 'SUPER_ADMIN';
  const result = await ProductServices.getProduct(id, isSuperAdmin, isStaff);

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

const getProductBySlug = catchAsync(async (req, res) => {
  const { slug } = req.params;
  const result = await ProductServices.getProductBySlug(slug);

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
  // let newImageUrls: string[] = [];
  // if (req.files && Array.isArray(req.files)) {
  //   const uploadedFiles = req.files as Express.Multer.File[];
  //   newImageUrls = uploadedFiles.map(
  //     (file) => `${process.env.BACKEND_LIVE_URL}/uploads/${file.filename}`
  //   );
  // }
  let newImageUrls: string[] = [];
  if (req.files && Array.isArray(req.files)) {
    const uploadedFiles = req.files as Express.Multer.File[];

    const uploaded = await Promise.all(
      uploadedFiles.map((file) =>
        uploadToCloudinary(file, "khushbuwaala_images/products", "product")
      )
    );

    newImageUrls = uploaded.map((u) => u.location);
  }

  // Parse data
  const parsedData = {
    ...req.body,
    published: req.body.published,
    tags: req.body.tags,
    accords: req.body.accords,
    bestFor: req.body.bestFor,
    perfumeNotes: req.body.perfumeNotes,
    stock: req.body.stock,
    variants: req.body.variants,
    imagesToKeep: req.body.imagesToKeep ?
      req.body.imagesToKeep : [],
    newImages: newImageUrls,
  };

  const isSuperAdmin = req.user?.role === 'SUPER_ADMIN';
  const result = await ProductServices.updateProduct(id, parsedData as IUpdateProduct, isSuperAdmin);

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

// Get Products by Category Id
const getProductsByCategoryId = catchAsync(async (req, res) => {
  const { categoryId } = req.params;
  const query = parseProductQuery(req.query);

  const result = await ProductServices.getProductsByCategoryId(categoryId, query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Category products retrieved successfully',
    meta: result.meta,
    data: result.data,
  });
});

// Get Products by Category Name (NOT WORKING)
const getProductsByCategoryName = catchAsync(async (req, res) => {
  const { categoryName } = req.params;
  const query = parseProductQuery(req.query);

  const result = await ProductServices.getProductsByCategoryName(categoryName, query);

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
  const query = parseProductQuery(req.query);

  const result = await ProductServices.searchProducts(query);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Products search completed successfully',
    meta: result.meta,
    data: result.data,
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
// const updateVariantStock = catchAsync(async (req, res) => {
//   const { variantId } = req.params;
//   const { newStock, reason } = req.body;

//   const result = await ProductServices.updateVariantStock(variantId, newStock, reason);

//   sendResponse(res, {
//     statusCode: httpStatus.OK,
//     success: true,
//     message: 'Variant stock updated successfully',
//     data: result,
//   });
// });

// Update product Stock
const updateProductStock = catchAsync(async (req, res) => {
  const { productId } = req.params;
  const { addedStock, reason } = req.body;

  const result = await ProductServices.updateProductStock(productId, Number(addedStock), reason);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Product stock updated successfully',
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

const getStockLogs = catchAsync(async (req, res) => {
  const { productId } = req.params;
  const result = await ProductServices.getStockLogs(productId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result ? 'Stock logs fetched successfully' : 'Failed to fetch stock logs',
    data: result ?? [],
  });
});

// Set Variant Packaging Costs
const setVariantPackagingCost = catchAsync(async (req, res) => {
  const { sku } = req.params;
  const payload = req.body; // Expects costLines array

  if (!payload.costLines || !Array.isArray(payload.costLines)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'costLines array is required');
  }

  const result = await ProductServices.upsertVariantPackagingCost(sku, { sku, costLines: payload.costLines });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Variant packaging costs updated successfully',
    data: result,
  });
});

// Receive Stock Purchase (Procurement)
const receiveStockPurchase = catchAsync(async (req, res) => {
  const { productId } = req.params;

  const payload = {
    ...req.body,
    productId,
    createdById: req.user?.id,
  };

  if (!payload.quantity || !payload.costLines) {
    throw new AppError(httpStatus.BAD_REQUEST, 'quantity and costLines are required');
  }

  // One implementation for both purchase routes (this one and /finance/procurement/purchase).
  const result = await FinanceServices.addStockPurchaseAndUpdateWAC(payload);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Stock purchase recorded and WAC updated successfully',
    data: result,
  });
});

const quickUpdateCell = catchAsync(async (req, res) => {
  const isSuperAdmin = req.user?.role === 'SUPER_ADMIN';
  const result = await ProductServices.quickUpdateCell(req.body, isSuperAdmin);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Cell updated successfully',
    data: result,
  });
});

const generateGoogleShoppingFeed = catchAsync(async (req, res) => {
  const xmlFeed = await ProductServices.generateGoogleShoppingFeed();

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.status(httpStatus.OK).send(xmlFeed);
});

export const ProductController = {
  createProduct,
  getAllProducts,
  getAllProductsAdmin,
  getProduct,
  getProductBySlug,
  updateProduct,
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
  updateProductStock,
  getProductAnalytics,
  getLowStockProducts,
  getBestsellers,
  getStockLogs,
  setVariantPackagingCost,
  receiveStockPurchase,
  quickUpdateCell,
  generateGoogleShoppingFeed,
};