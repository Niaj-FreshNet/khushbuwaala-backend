import { Router } from 'express';
import { InvestorController } from './investor.controller';
import auth from '../../middlewares/auth';

const router = Router();

router.get('/dashboard', auth('INVESTOR', 'SUPER_ADMIN'), InvestorController.getInvestorDashboard);
router.post('/withdraw', auth('INVESTOR'), InvestorController.requestWithdrawal);

router.get('/all', auth('SUPER_ADMIN'), InvestorController.getAllInvestors);
router.patch('/update/:id', auth('SUPER_ADMIN'), InvestorController.updateInvestorData);
router.get('/reconcile', auth('SUPER_ADMIN'), InvestorController.reconcileInvestors);

router.get('/withdrawals', auth('SUPER_ADMIN'), InvestorController.getAllWithdrawals);
router.patch('/withdrawals/:id/status', auth('SUPER_ADMIN'), InvestorController.updateWithdrawalStatus);

// Monthly profit share: preview any month, approve (credit balances) closed months
router.get('/profit-distributions', auth('SUPER_ADMIN'), InvestorController.previewProfitMonth);
router.post('/profit-distributions/approve', auth('SUPER_ADMIN'), InvestorController.approveProfitMonth);

// Full-ledger access requests
router.post('/ledger-access/request', auth('INVESTOR'), InvestorController.requestLedgerAccess);
router.get('/ledger-access/me', auth('INVESTOR'), InvestorController.myLedgerAccess);
router.get('/ledger-access', auth('SUPER_ADMIN'), InvestorController.listLedgerAccess);
router.patch('/ledger-access/:id', auth('SUPER_ADMIN'), InvestorController.decideLedgerAccess);
router.patch('/ledger-access/:id/revoke', auth('SUPER_ADMIN'), InvestorController.revokeLedgerAccess);

export const InvestorRoutes = router;