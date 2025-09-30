// routes/cartItem.routes.ts
import express from 'express';
import auth from '../../middlewares/auth';
import { CartItemController } from './cart.controller';

const router = express.Router();

router.post('/add-to-cart', auth('USER'), CartItemController.addToCart);
router.get('/', auth('USER'), CartItemController.getUserCart);
router.patch('/:id', auth('USER'), CartItemController.updateCartItem);
router.delete('/:id', auth('USER'), CartItemController.removeCartItem);

export const CartItemRoutes = router;
