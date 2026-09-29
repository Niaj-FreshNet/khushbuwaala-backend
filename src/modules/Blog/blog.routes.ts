import { Router } from 'express';
import auth from '../../middlewares/auth';
import { BlogController } from './blog.controller';
import { upload } from '../../utils/sendImageToCloudinary';

const router = Router();

// ==========================================
// 1. SPECIFIC / STATIC GET ROUTES (MUST BE FIRST)
// ==========================================

// Exact match: /api/blog/get-all-blogs/admin
router.get(
  '/get-all-blogs/admin',
  auth('SALESMAN', 'ADMIN', 'SUPER_ADMIN'),
  BlogController.getAllBlogsAdmin,
);

// Exact match: /api/blog/get-all-blogs
router.get('/get-all-blogs', BlogController.getAllBlogs);

// ==========================================
// 2. MUTATION ROUTES
// ==========================================

router.post(
  '/create-blog',
  auth('SALESMAN', 'ADMIN', 'SUPER_ADMIN'),
  upload.single('image'),
  BlogController.createBlog,
);

router.put(
  '/update-blog/:id',
  auth('SALESMAN', 'ADMIN', 'SUPER_ADMIN'),
  upload.single('image'),
  BlogController.updateBlog,
);

router.delete(
  '/delete-blog/:id',
  auth('ADMIN', 'SUPER_ADMIN'),
  BlogController.deleteBlog,
);

// ==========================================
// 3. PARAMETERIZED ROUTES (MUST BE LAST)
// ==========================================

// If this is placed above /get-all-blogs/admin, Express can mistake sub-segments
router.get('/get-blog/:slug', BlogController.getBlog);

export const BlogRoutes = router;