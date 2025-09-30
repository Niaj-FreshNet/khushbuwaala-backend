"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CategoryRoutes = void 0;
const express_1 = require("express");
const auth_1 = __importDefault(require("../../middlewares/auth"));
const category_controller_1 = require("./category.controller");
const fileUploader_1 = require("../../helpers/fileUploader");
const router = (0, express_1.Router)();
router.post('/create-category', (0, auth_1.default)('ADMIN'), fileUploader_1.upload.single('image'), category_controller_1.CategoryController.createCategory);
router.get('/get-all-categories', category_controller_1.CategoryController.getAllCategories);
router.get('/get-all-categories/admin', (0, auth_1.default)('ADMIN'), category_controller_1.CategoryController.getAllCategoriesAdmin);
router.get('/get-category/:id', category_controller_1.CategoryController.getCategory);
router.patch('/update-category/:id', (0, auth_1.default)('ADMIN'), fileUploader_1.upload.single('image'), category_controller_1.CategoryController.updateCategory);
router.delete('/delete-category/:id', (0, auth_1.default)('ADMIN'), category_controller_1.CategoryController.deleteCategory);
exports.CategoryRoutes = router;
