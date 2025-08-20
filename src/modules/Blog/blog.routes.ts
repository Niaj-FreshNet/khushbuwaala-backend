import { Router } from 'express';
import auth from '../../middlewares/auth';
import { BlogController } from './blog.controller';
import { upload } from '../../helpers/fileUploader';
const router = Router();

router.post(
  '/create-blog',
  auth('ADMIN'),
  upload.single('image'),
  BlogController.createBlog,
);

// Need to Add
router.get('/get-all-blogs', BlogController.getAllBlogs);
router.get(
  '/get-all-blogs/admin',
  auth('ADMIN'),
  BlogController.getAllBlogsAdmin,
);
router.get('/get-blog/:id', BlogController.getBlog);
router.put(
  '/update-blog/:id',
  auth('ADMIN'),
  upload.single('image'),
  BlogController.updateBlog,
);
router.delete('/delete-blog/:id', auth('ADMIN'), BlogController.deleteBlog);

export const BlogRoutes = router;
