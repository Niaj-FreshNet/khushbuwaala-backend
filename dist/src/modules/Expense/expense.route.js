"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpenseRoutes = void 0;
const express_1 = require("express");
const expense_controller_1 = require("./expense.controller");
const auth_1 = __importDefault(require("../../middlewares/auth"));
const router = (0, express_1.Router)();
router.get('/get-all-orders', (0, auth_1.default)('ADMIN'), expense_controller_1.OrderController.getAllOrders);
router.get('/get-order-by-id/:id', (0, auth_1.default)('ADMIN'), expense_controller_1.OrderController.getOrderById);
router.patch('/update-order-status/:id', (0, auth_1.default)('ADMIN'), expense_controller_1.OrderController.updateOrderStatus);
router.get('/get-all-customers', (0, auth_1.default)('ADMIN'), expense_controller_1.OrderController.getAllCustomers);
router.get('/get-user-orders/:id', expense_controller_1.OrderController.getUserOrders);
router.get('/my-orders', (0, auth_1.default)('USER'), expense_controller_1.OrderController.getMyOrders);
router.get('/my-orders/:id', (0, auth_1.default)('USER'), expense_controller_1.OrderController.getMyOrderByID);
exports.ExpenseRoutes = router;
