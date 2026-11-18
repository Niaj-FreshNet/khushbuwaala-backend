import { Router } from 'express';
import { InvestorController } from './investor.controller';
import auth from '../../middlewares/auth';

const router = Router();

router.get('/dashboard', auth('INVESTOR', 'SUPER_ADMIN'), InvestorController.getInvestorDashboard);
router.post('/withdraw', auth('INVESTOR'), InvestorController.requestWithdrawal);

router.get('/all', auth('SUPER_ADMIN'), InvestorController.getAllInvestors);
router.patch('/update/:id', auth('SUPER_ADMIN'), InvestorController.updateInvestorData);

router.get('/withdrawals', auth('SUPER_ADMIN'), InvestorController.getAllWithdrawals);
router.patch('/withdrawals/:id/status', auth('SUPER_ADMIN'), InvestorController.updateWithdrawalStatus);

export const InvestorRoutes = router;