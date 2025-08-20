import { Router } from 'express';
import auth from '../../middlewares/auth';
import { WishlistController } from './wishlist.controller';
const router = Router();

router.get('/get-wishlist', auth('USER'), WishlistController.getWishlist);
router.post('/add-to-wishlist', auth('USER'), WishlistController.addToWishlist);
router.delete(
  '/remove-from-wishlist/:id',
  auth('USER'),
  WishlistController.removeFromWishlist,
);

export const WishlistRoutes = router;
