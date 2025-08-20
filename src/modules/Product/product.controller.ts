import AppError from '../../errors/AppError';
import catchAsync from '../../utils/catchAsync';
import { uploadToDigitalOceanAWS } from '../../utils/sendImageToCloudinary';
import sendResponse from '../../utils/sendResponse';
import { ProductServices } from './product.service';

const createProduct = catchAsync(async (req, res) => {
  const { categoryId, materialId, variants } = req.body;

  if (!categoryId) throw new Error('Category is required');
  if (!materialId) throw new Error('Material is required');

  if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
    throw new Error('At least one image is required');
  }

  const uploadPromises = (req.files as Express.Multer.File[]).map(
    (file) => file.filename,
  );

  const uploadResults = await Promise.all(uploadPromises);
  const imageUrls = uploadResults.map(
    (upload) => `${process.env.BACKEND_LIVE_URL}/uploads/${upload}`,
  );

  if (req.body.published && typeof req.body.published === 'string') {
    req.body.published = req.body.published === 'true';
  }

  // Handle tags
  const tags =
    typeof req.body.tags === 'string'
      ? req.body.tags.split(',')
      : req.body.tags;

  // Handle variants
  let parsedVariants: {
    size: string;
    color: string;
    price: number;
    quantity: number;
  }[] = [];

  if (typeof variants === 'string') {
    parsedVariants = JSON.parse(variants);
  } else if (Array.isArray(variants)) {
    parsedVariants = variants;
  } else {
    throw new Error('Variants must be provided as an array or JSON string');
  }

  if (typeof req.body.published === 'string') {
    req.body.published = req.body.published === 'true' ? true : false;
  }

  const productPayload = {
    name: req.body.name,
    description: req.body.description,
    imageUrl: imageUrls,
    tags,
    materialId,
    categoryId,
    published: req.body.published,
    variants: parsedVariants,
  };

  const result = await ProductServices.createProduct(productPayload);
  const isOk = result ? true : false;

  sendResponse(res, {
    statusCode: isOk ? 201 : 400,
    success: isOk ? true : false,
    message: isOk ? 'Product created successfully' : 'Product creation failed',
    Data: isOk ? result : [],
  });
});

const getAllProducts = catchAsync(async (req, res) => {
  const result = await ProductServices.getAllProducts(req);
  const isok = result ? true : false;
  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok
      ? 'Products Fetched Successfully'
      : 'Products Fetching Failed',
    Data: isok ? result : [],
  });
});

const getAllProductsAdmin = catchAsync(async (req, res) => {
  const result = await ProductServices.getAllProductsAdmin(req);
  const isok = result ? true : false;
  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok
      ? 'Products Fetched Successfully'
      : 'Products Fetching Failed',
    Data: isok ? result : [],
  });
});

const getProduct = catchAsync(async (req, res) => {
  const result = await ProductServices.getProduct(req.params.id);
  const isok = result ? true : false;
  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok
      ? 'Product Fetched Successfully'
      : 'Product Fetching Failed, No Product Found With This ID',
    Data: isok ? result : [],
  });
});

const updateProduct = catchAsync(async (req, res) => {
  const id = req.params.id;
  const {
    name,
    description,
    tags,
    materialId,
    categoryId,
    published,
    variants,
  } = req.body;

  console.log(variants, 'variants in updateProduct');

  let imageUrlsToKeep: string[] = [];

  if (req.body.imageUrlsToKeep) {
    try {
      imageUrlsToKeep =
        typeof req.body.imageUrlsToKeep === 'string'
          ? JSON.parse(req.body.imageUrlsToKeep)
          : req.body.imageUrlsToKeep;

      if (!Array.isArray(imageUrlsToKeep)) {
        throw new AppError(400, 'imageUrlsToKeep must be an array');
      }
    } catch {
      throw new AppError(400, 'Invalid imageUrlsToKeep format');
    }
  }

  let newImageUrls: string[] = [];
  if (req.files && Array.isArray(req.files)) {
    const uploadPromises = (req.files as Express.Multer.File[]).map(
      (file) => file.filename,
    );
    newImageUrls = (await Promise.all(uploadPromises)).map(
      (upload) => `${process.env.BACKEND_LIVE_URL}/uploads/${upload}`,
    );
  }

  const parsedVariants =
    typeof variants === 'string' ? JSON.parse(variants) : variants;

  const updatePayload = {
    name,
    description,
    tags: typeof tags === 'string' ? tags.split(',') : tags,
    materialId,
    categoryId,
    published:
      published === 'true' ? true : published === 'false' ? false : undefined,
    imageUrlsToKeep,
    newImageUrls,
    variants: parsedVariants,
  };

  const result = await ProductServices.updateProduct(id, updatePayload);

  sendResponse(res, {
    statusCode: result ? 200 : 400,
    success: !!result,
    message: result ? 'Product Updated Successfully' : 'Product Update Failed',
    Data: result || [],
  });
});

const deleteProduct = catchAsync(async (req, res) => {
  const result = await ProductServices.deleteProduct(req.params.id);
  const isok = result ? true : false;
  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok ? 'Product Deleted Successfully' : 'Product Deletion Failed',
    Data: isok ? result : [],
  });
});

// Get Trending Products In Home Page
const getTrendingProducts = catchAsync(async (req, res) => {
  const result = await ProductServices.getTrendingProducts();
  const isok = result ? true : false;
  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok
      ? 'Trending Products Fetched Successfully'
      : 'Trending Products Fetching Failed',
    Data: isok ? result : [],
  });
});

const getNavbarProducts = catchAsync(async (req, res) => {
  const result = await ProductServices.getNavbarProducts();
  const isok = result ? true : false;
  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok
      ? 'Navbar Products Fetched Successfully'
      : 'Navbar Products Fetching Failed',
    Data: isok ? result : [],
  });
});

export const ProductController = {
  createProduct,
  getAllProducts,
  getProduct,
  updateProduct,
  deleteProduct,
  getAllProductsAdmin,
  getTrendingProducts,
  getNavbarProducts,
};
