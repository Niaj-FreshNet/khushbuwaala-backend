import { Router } from 'express';
import { AuthController } from './auth.controller';
import validateRequest from '../../middlewares/validateRequest';
import { authValidation } from './auth.validation';
import auth from '../../middlewares/auth';

const router = Router();

router.post(
  '/register',
  validateRequest(authValidation.UserRegisterValidationSchema),
  AuthController.register,
);

router.post('/verify-email', AuthController.verifyEmail);
router.post(
  '/login',
  validateRequest(authValidation.UserLoginValidationSchema),
  AuthController.login,
);
router.post('/forgot-password', AuthController.forgotPassword);
router.post('/reset-password/:token', AuthController.resetPassword);

router.post(
  '/change-password',
  auth('ADMIN', 'USER'),
  AuthController.changePassword,
);
router.post('/refresh-token', AuthController.refreshToken);
router.post('/resend-verify-email-token', AuthController.resendVerifyEmail);
router.post('/social-login', AuthController.socialLogin);
router.post('/make-admin', AuthController.makeAdmin);
router.post('/make-salesman', AuthController.makeSalesman);

export const AuthRoutes = router;
