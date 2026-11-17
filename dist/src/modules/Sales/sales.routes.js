"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SalesRoutes = void 0;
const express_1 = require("express");
const sales_controller_1 = require("./sales.controller");
const auth_1 = __importDefault(require("../../middlewares/auth"));
const router = (0, express_1.Router)();
// 1. Static / Specific Routes First
router.post('/create-sale', (0, auth_1.default)('SALESMAN', 'ADMIN', 'SUPER_ADMIN'), sales_controller_1.SalesController.createSale);
router.get('/get-all-sales', (0, auth_1.default)('ADMIN', 'SUPER_ADMIN'), sales_controller_1.SalesController.getAllSales);
router.get('/my-sales', (0, auth_1.default)('SALESMAN', 'ADMIN', 'SUPER_ADMIN'), sales_controller_1.SalesController.getMySales);
router.get('/get-sales-analytics', (0, auth_1.default)('ADMIN', 'SUPER_ADMIN'), sales_controller_1.SalesController.getSalesAnalytics);
// 2. Parameterized Routes Last
router.get('/get-sale-by-id/:id', (0, auth_1.default)('SALESMAN', 'ADMIN', 'SUPER_ADMIN'), sales_controller_1.SalesController.getSaleById);
router.get('/get-sales-by-customer/:phone', (0, auth_1.default)('SALESMAN', 'ADMIN', 'SUPER_ADMIN'), sales_controller_1.SalesController.getSalesByCustomer);
router.patch('/update-sale-status/:id', (0, auth_1.default)('SALESMAN', 'ADMIN', 'SUPER_ADMIN'), sales_controller_1.SalesController.updateSaleStatus);
// Update full sale route
router.patch('/update-sale/:id', (0, auth_1.default)('SUPER_ADMIN', 'ADMIN', 'SALESMAN'), sales_controller_1.SalesController.updateSale);
// Delete sale route
router.delete('/delete-sale/:id', (0, auth_1.default)('SUPER_ADMIN', 'ADMIN'), // Typically restricted to Admins
sales_controller_1.SalesController.deleteSale);
exports.SalesRoutes = router;
