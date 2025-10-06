import { Router } from 'express';
import { FragranceController } from './fragrance.controller';
import auth from '../../middlewares/auth';

const router = Router();

router.get('/get-all-fragrances', FragranceController.getAllFragrances);

router.post(
  '/create-fragrance',
  auth('ADMIN','SUPER_ADMIN'),
  FragranceController.createFragrance,
);

router.get('/get-fragrance/:id', auth('ADMIN','SUPER_ADMIN'), FragranceController.getFragrance);

router.patch(
  '/update-fragrance/:id',
  auth('ADMIN','SUPER_ADMIN'),
  FragranceController.updateFragrance,
);

router.delete(
  '/delete-fragrance/:id',
  auth('ADMIN','SUPER_ADMIN'),
  FragranceController.deleteFragrance,
);

export const FragranceRoutes = router;
