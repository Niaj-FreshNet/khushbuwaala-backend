import { Router } from 'express';
import auth from '../../middlewares/auth';
import { UserController } from './user.controller';
import { upload } from '../../helpers/fileUploader';

const router = Router();

router.get('/get-all-users', auth('ADMIN'), UserController.getAllUsers);
router.get('/get-user-by-id/:id', auth('ADMIN', 'SUPER_ADMIN'), UserController.getUserByID)
router.get('/profile', auth('SUPER_ADMIN', 'ADMIN', 'SALESMAN', 'USER'), UserController.getUser);
router.patch(
  '/change-password',
  auth('SUPER_ADMIN', 'ADMIN', 'SALESMAN', 'USER'),
  UserController.changePassword,
);
router.patch(
  '/update-profile/:id',
  auth('SUPER_ADMIN', 'ADMIN', 'SALESMAN', 'USER'),
  upload.single('image'),
  UserController.updateUser,
);

export const UserRoutes = router;
