import { Router } from 'express';
import { AuthController } from './auth.controller';
import validateRequest from '../../middlewares/validateRequest';
import { authValidation } from './auth.validation';
import auth from '../../middlewares/auth';

const router = Router();

// Public routes
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
router.post('/social-login', AuthController.socialLogin);

// Protected routes
router.post('/change-password', auth('ADMIN', 'USER'), AuthController.changePassword);
router.post('/refresh-token', AuthController.refreshToken);
router.post('/resend-verify-email-token', AuthController.resendVerifyEmail);

router.post('/make-admin', auth('SUPER_ADMIN'), AuthController.makeAdmin);
router.post('/make-salesman', auth('ADMIN'), AuthController.makeSalesman);

router.get('/get-me', auth('ADMIN', 'SUPER_ADMIN', 'SALESMAN', 'USER'), AuthController.getMe);

// Logout route
router.post('/logout', AuthController.logout);

export const AuthRoutes = router;
