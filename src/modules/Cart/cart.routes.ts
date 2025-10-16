import express from 'express';
import auth from '../../middlewares/auth';
import { CartItemController } from './cart.controller';

const router = express.Router();

// Visitors + logged-in users both can add/view/update/delete cart items
router.post('/add-to-cart', auth('OPTIONAL'), CartItemController.addToCart);
router.get('/', auth('OPTIONAL'), CartItemController.getUserCart);
router.patch('/:id', auth('OPTIONAL'), CartItemController.updateCartItem);
router.delete('/:id', auth('OPTIONAL'), CartItemController.removeCartItem);

export const CartItemRoutes = router;
