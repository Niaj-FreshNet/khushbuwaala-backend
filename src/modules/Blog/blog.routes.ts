import { Router } from 'express';
import auth from '../../middlewares/auth';
import { BlogController } from './blog.controller';
import { upload } from '../../utils/sendImageToCloudinary';

const router = Router();

// ==========================================
// 1. SPECIFIC / STATIC GET ROUTES (MUST BE FIRST)
// ==========================================

router.get(
  '/get-all-blogs/admin',
  auth('SALESMAN', 'ADMIN', 'SUPER_ADMIN'),
  BlogController.getAllBlogsAdmin,
);

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

// ⚡ CHANGED FROM router.put TO router.patch TO MATCH FRONTEND RTK QUERY
router.patch(
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

router.get('/get-blog/:slug', BlogController.getBlog);

export const BlogRoutes = router;