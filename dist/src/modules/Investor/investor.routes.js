"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvestorRoutes = void 0;
const express_1 = require("express");
const investor_controller_1 = require("./investor.controller");
const auth_1 = __importDefault(require("../../middlewares/auth"));
const router = (0, express_1.Router)();
router.get('/dashboard', (0, auth_1.default)('INVESTOR', 'SUPER_ADMIN'), investor_controller_1.InvestorController.getInvestorDashboard);
router.post('/withdraw', (0, auth_1.default)('INVESTOR'), investor_controller_1.InvestorController.requestWithdrawal);
router.get('/all', (0, auth_1.default)('SUPER_ADMIN'), investor_controller_1.InvestorController.getAllInvestors);
router.patch('/update/:id', (0, auth_1.default)('SUPER_ADMIN'), investor_controller_1.InvestorController.updateInvestorData);
router.get('/withdrawals', (0, auth_1.default)('SUPER_ADMIN'), investor_controller_1.InvestorController.getAllWithdrawals);
router.patch('/withdrawals/:id/status', (0, auth_1.default)('SUPER_ADMIN'), investor_controller_1.InvestorController.updateWithdrawalStatus);
exports.InvestorRoutes = router;
