import { Router } from 'express';
import auth from '../../middlewares/auth';
import { CategoryController } from './category.controller';
import { upload } from '../../helpers/fileUploader';

const router = Router();

router.post(
  '/create-category',
  auth('ADMIN'),
  upload.single('image'),
  CategoryController.createCategory,
);

router.get('/get-all-categories', CategoryController.getAllCategories);
router.get(
  '/get-all-categories/admin',
  auth('ADMIN'),
  CategoryController.getAllCategoriesAdmin,
);
router.get('/get-category/:id', CategoryController.getCategory);

router.patch(
  '/update-category/:id',
  auth('ADMIN'),
  upload.single('image'),
  CategoryController.updateCategory,
);

router.delete(
  '/delete-category/:id',
  auth('ADMIN'),
  CategoryController.deleteCategory,
);

export const CategoryRoutes = router;
