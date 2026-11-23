import { Router } from 'express';
import auth from '../../middlewares/auth';
import { WishlistController } from './wishlist.controller';

const router = Router();

// Every route is the signed-in user's own list: the user id comes from the token, never the request.
const signedIn = auth('USER', 'SALESMAN', 'ADMIN', 'SUPER_ADMIN', 'INVESTOR');

router.get('/', signedIn, WishlistController.getWishlist);
router.post('/', signedIn, WishlistController.addToWishlist);
router.post('/merge', signedIn, WishlistController.mergeWishlist);
router.delete('/', signedIn, WishlistController.clearWishlist);
router.delete('/:productId', signedIn, WishlistController.removeFromWishlist);

export const WishlistRoutes = router;
