"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SalesRoutes = void 0;
const express_1 = require("express");
const sale_controller_1 = require("./sale.controller");
const auth_1 = __importDefault(require("../../middlewares/auth"));
const router = (0, express_1.Router)();
router.get('/add-sale', (0, auth_1.default)('ADMIN'), sale_controller_1.SaleController.addSale);
router.get('/get-all-sales', (0, auth_1.default)('ADMIN'), sale_controller_1.SaleController.getAllSales);
router.get('/get-sale-by-id/:id', (0, auth_1.default)('ADMIN'), sale_controller_1.SaleController.getSaleById);
router.patch('/update-sale-status/:id', (0, auth_1.default)('ADMIN'), sale_controller_1.SaleController.updateSaleStatus);
router.get('/get-all-salesmans', (0, auth_1.default)('ADMIN'), sale_controller_1.SaleController.getAllSalesman);
router.get('/get-user-sales/:id', sale_controller_1.SaleController.getUserSales);
router.get('/my-sales', (0, auth_1.default)('USER'), sale_controller_1.SaleController.getMySales);
router.get('/my-sales/:id', (0, auth_1.default)('USER'), sale_controller_1.SaleController.getMySaleByID);
exports.SalesRoutes = router;
