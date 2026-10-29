"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlogRoutes = void 0;
const express_1 = require("express");
const auth_1 = __importDefault(require("../../middlewares/auth"));
const blog_controller_1 = require("./blog.controller");
const sendImageToCloudinary_1 = require("../../utils/sendImageToCloudinary");
const router = (0, express_1.Router)();
// ==========================================
// 1. SPECIFIC / STATIC GET ROUTES (MUST BE FIRST)
// ==========================================
// Exact match: /api/blog/get-all-blogs/admin
router.get('/get-all-blogs/admin', (0, auth_1.default)('SALESMAN', 'ADMIN', 'SUPER_ADMIN'), blog_controller_1.BlogController.getAllBlogsAdmin);
// Exact match: /api/blog/get-all-blogs
router.get('/get-all-blogs', blog_controller_1.BlogController.getAllBlogs);
// ==========================================
// 2. MUTATION ROUTES
// ==========================================
router.post('/create-blog', (0, auth_1.default)('SALESMAN', 'ADMIN', 'SUPER_ADMIN'), sendImageToCloudinary_1.upload.single('image'), blog_controller_1.BlogController.createBlog);
router.put('/update-blog/:id', (0, auth_1.default)('SALESMAN', 'ADMIN', 'SUPER_ADMIN'), sendImageToCloudinary_1.upload.single('image'), blog_controller_1.BlogController.updateBlog);
router.delete('/delete-blog/:id', (0, auth_1.default)('ADMIN', 'SUPER_ADMIN'), blog_controller_1.BlogController.deleteBlog);
// ==========================================
// 3. PARAMETERIZED ROUTES (MUST BE LAST)
// ==========================================
// If this is placed above /get-all-blogs/admin, Express can mistake sub-segments
router.get('/get-blog/:slug', blog_controller_1.BlogController.getBlog);
exports.BlogRoutes = router;
