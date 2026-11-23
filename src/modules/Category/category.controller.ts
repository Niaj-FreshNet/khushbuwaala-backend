import AppError from '../../errors/AppError';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { ICategory } from './category.interface';
import { CategoryServices } from './category.service';
import { uploadToCloudinary, deleteFromCloudinary } from '../../utils/sendImageToCloudinary';

const createCategory = catchAsync(async (req, res) => {
  if (!req.file) throw new AppError(400, 'At least one image is required');

  // ✅ Upload image to Cloudinary dynamically
  const { location: imageUrl } = await uploadToCloudinary(req.file, 'khushbuwaala-categories', 'category');

  // Convert string booleans and JSON arrays
  if (typeof req.body.published === 'string') req.body.published = req.body.published === 'true';
  if (req.body.sizes && typeof req.body.sizes === 'string') req.body.sizes = JSON.parse(req.body.sizes);

  const categoryData: ICategory = {
    ...req.body,
    imageUrl,
  };

  const result = await CategoryServices.createCategory(categoryData);

  sendResponse(res, {
    statusCode: result ? 200 : 400,
    success: !!result,
    message: result ? 'Category Created Successfully' : 'Category Creation Failed',
    data: result || [],
  });
});

const updateCategory = catchAsync(async (req, res) => {
  const category = await CategoryServices.getCategory(req.params.id);
  if (!category) throw new AppError(400, 'Category not found');

  const updatedData: Partial<ICategory> = { ...req.body };
  if (typeof updatedData.published === 'string') updatedData.published = updatedData.published === 'true';

  // ✅ Handle image update
  if (req.file) {
    if (category.imageUrl) await deleteFromCloudinary(category.imageUrl);
    const { location } = await uploadToCloudinary(req.file, 'khushbuwaala-categories', 'category');
    updatedData.imageUrl = location;
  }

  const result = await CategoryServices.updateCategory(req.params.id, updatedData);

  sendResponse(res, {
    statusCode: result ? 200 : 400,
    success: !!result,
    message: result ? 'Category Updated Successfully' : 'Category Updation Failed',
    data: result || [],
  });
});

const deleteCategory = catchAsync(async (req, res) => {
  const category = await CategoryServices.getCategory(req.params.id);
  if (!category) throw new AppError(400, 'Category not found');

  if (category.imageUrl) await deleteFromCloudinary(category.imageUrl);

  const result = await CategoryServices.deleteCategory(req.params.id);

  sendResponse(res, {
    statusCode: result ? 200 : 400,
    success: !!result,
    message: result ? 'Category Deleted Successfully' : 'Category Deletion Failed',
    data: result || [],
  });
});

// ✅ Other GET methods remain unchanged
const getAllCategories = catchAsync(async (req, res) => {
  const result = await CategoryServices.getAllCategories(req.query);
  sendResponse(res, {
    statusCode: result ? 200 : 400,
    success: !!result,
    message: result ? 'Categories Fetched Successfully' : 'Categories Fetching Failed',
    data: result || [],
  });
});

const getAllCategoriesAdmin = catchAsync(async (req, res) => {
  const result = await CategoryServices.getAllCategoriesAdmin(req.query);
  sendResponse(res, {
    statusCode: result ? 200 : 400,
    success: !!result,
    message: result ? 'Categories Fetched Successfully' : 'Categories Fetching Failed',
    data: result || [],
  });
});

const getCategory = catchAsync(async (req, res) => {
  const result = await CategoryServices.getCategory(req.params.id);
  sendResponse(res, {
    statusCode: result ? 200 : 400,
    success: !!result,
    message: result ? 'Category Fetched Successfully' : 'Category Fetching Failed',
    data: result || [],
  });
});

export const CategoryController = {
  createCategory,
  getAllCategories,
  getAllCategoriesAdmin,
  getCategory,
  updateCategory,
  deleteCategory,
};
