import { Router } from 'express';
import { ProductController } from './product.controller';
import auth from '../../middlewares/auth';
import { upload } from '../../helpers/fileUploader';
const router = Router();

router.post(
  '/create-product',
  auth('ADMIN'),
  upload.array('images'),
  ProductController.createProduct,
);
router.get('/get-all-products', ProductController.getAllProducts);
router.get(
  '/get-all-products/admin',
  auth('ADMIN'),
  ProductController.getAllProductsAdmin,
);
router.get('/get-product/:id', ProductController.getProduct);
router.patch(
  '/update-product/:id',
  auth('ADMIN'),
  upload.array('images'),
  ProductController.updateProduct,
);
router.delete(
  '/delete-product/:id',
  auth('ADMIN'),
  ProductController.deleteProduct,
);

router.get('/get-trending-products', ProductController.getTrendingProducts);
router.get('/get-navbar-products', ProductController.getNavbarProducts);

export const ProductRoutes = router;
