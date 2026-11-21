import { Router } from 'express';
import { AuthController } from './auth.controller';
import validateRequest from '../../middlewares/validateRequest';
import { authValidation } from './auth.validation';
import auth from '../../middlewares/auth';
import { limits } from '../../middlewares/rateLimit';

const router = Router();

// Public routes
router.post(
  '/register',
  limits.register,
  validateRequest(authValidation.UserRegisterValidationSchema),
  AuthController.register,
);

router.post('/verify-email', limits.tokenCheck, AuthController.verifyEmail);

router.post(
  '/login',
  limits.login,
  limits.loginPerEmail,
  validateRequest(authValidation.UserLoginValidationSchema),
  AuthController.login,
);

router.post('/forgot-password', limits.passwordEmail, AuthController.forgotPassword);
router.post('/reset-password/:token', limits.tokenCheck, AuthController.resetPassword);
router.post('/social-login', limits.login, AuthController.socialLogin);

// Protected routes
router.post('/change-password', auth('SUPER_ADMIN', 'ADMIN', 'SALESMAN', 'USER', 'INVESTOR'), AuthController.changePassword);
router.post('/refresh-token', AuthController.refreshToken);
router.post('/resend-verify-email-token', limits.passwordEmail, AuthController.resendVerifyEmail);

router.post('/make-admin', auth('SUPER_ADMIN'), AuthController.makeAdmin);
router.post('/make-salesman', auth('ADMIN', 'SUPER_ADMIN'), AuthController.makeSalesman);

router.patch(
  '/approve-role',
  auth('SUPER_ADMIN'),
  AuthController.approveOrUpdateUserRole
);

router.get('/get-me', auth('ADMIN', 'SUPER_ADMIN', 'SALESMAN', 'INVESTOR', 'USER'), AuthController.getMe);

// Logout route
router.post('/logout', AuthController.logout);

export const AuthRoutes = router;
