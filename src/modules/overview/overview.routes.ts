import { Router } from 'express';
import auth from '../../middlewares/auth';
import { OverviewController } from './overview.controller';
const router = Router();

// Dashboard Overview
router.get('/get-overview', auth('ADMIN'), OverviewController.getOverview);
router.get(
  '/get-weekly-overview',
  auth('ADMIN'),
  OverviewController.getWeeklyOverview,
);

router.get(
  '/get-weekly-sales',
  auth('ADMIN'),
  OverviewController.getWeeklySales,
);

export const OverviewRoutes = router;
