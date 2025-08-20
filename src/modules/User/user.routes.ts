import { Router } from 'express';
import auth from '../../middlewares/auth';
import { UserController } from './user.controller';
import { upload } from '../../helpers/fileUploader';

const router = Router();

router.get('/get-all-users', auth('ADMIN'), UserController.getAllUsers);
router.get('/profile', auth('ADMIN', 'USER'), UserController.getUser);
router.patch(
  '/change-password',
  auth('ADMIN', 'USER'),
  UserController.changePassword,
);
router.patch(
  '/update-profile',
  auth('ADMIN', 'USER'),
  upload.single('image'),
  UserController.updateUser,
);

export const UserRoutes = router;
