import { Router } from 'express';
import httpStatus from 'http-status';
import auth from '../../middlewares/auth';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { requireUser } from '../../utils/requestUser';
import { StorefrontServices } from './storefront.service';
import { DEFAULT_SETTINGS, LIMITS } from './storefront.settings';

const router = Router();

// Public: what the storefront shows (announcement bar, banners, home rows).
router.get(
  '/settings',
  catchAsync(async (_req, res) => {
    const data = await StorefrontServices.getSettings();
    res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
    sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Storefront settings', data });
  })
);

// Admin screen: the same, plus the limits and the built-in defaults ("reset" button).
router.get(
  '/settings/admin',
  auth('ADMIN', 'SUPER_ADMIN'),
  catchAsync(async (_req, res) => {
    const data = await StorefrontServices.getSettings();
    sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Storefront settings', data: { ...data, defaults: DEFAULT_SETTINGS, limits: LIMITS } });
  })
);

router.put(
  '/settings',
  auth('ADMIN', 'SUPER_ADMIN'),
  catchAsync(async (req, res) => {
    const data = await StorefrontServices.saveSettings(req.body, requireUser(req).id);
    sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Storefront updated', data });
  })
);

export const StorefrontRoutes = router;
