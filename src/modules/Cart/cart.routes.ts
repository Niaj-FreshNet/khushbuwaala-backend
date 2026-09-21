// src/modules/Cart/cart.routes.ts
import express from 'express';
import auth from '../../middlewares/auth';
import { CartItemController } from './cart.controller';

const router = express.Router();

// Admin only: view all user & guest carts across the system
router.get(
  '/all-carts',
  auth('ADMIN', 'SUPER_ADMIN'),
  CartItemController.getAllCarts
);

router.post('/add-to-cart', auth('OPTIONAL'), CartItemController.addToCart);
router.get('/', auth('OPTIONAL'), CartItemController.getUserCart);
router.patch('/:id', auth('OPTIONAL'), CartItemController.updateCartItem);
router.delete('/:id', auth('OPTIONAL'), CartItemController.removeCartItem);

export const CartItemRoutes = router;