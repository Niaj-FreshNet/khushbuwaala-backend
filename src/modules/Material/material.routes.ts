import { Router } from 'express';
import { MaterialController } from './material.controller';
import auth from '../../middlewares/auth';

const router = Router();

router.get('/get-all-materials', MaterialController.getAllMaterials);

router.post(
  '/create-material',
  auth('ADMIN','SUPER_ADMIN'),
  MaterialController.createMaterial,
);

router.get('/get-material/:id', auth('ADMIN','SUPER_ADMIN'), MaterialController.getMaterial);

router.patch(
  '/update-material/:id',
  auth('ADMIN','SUPER_ADMIN'),
  MaterialController.updateMaterial,
);

router.delete(
  '/delete-material/:id',
  auth('ADMIN','SUPER_ADMIN'),
  MaterialController.deleteMaterial,
);

export const MaterialRoutes = router;
