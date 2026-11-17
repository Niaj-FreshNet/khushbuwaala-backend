import { Request, Response } from 'express';
import AppError from '../../errors/AppError';
import { deleteFile } from '../../helpers/fileDelete';
import { prisma } from '../../../prisma/client';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { IBlog } from './blog.interface';
import { BlogServices } from './blog.service';

const createBlog = catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;

  // ⚡ Accept imageUrl from JSON body first (Cloudinary), or fall back to Multer file if uploaded locally
  let imageUrl = req.body.imageUrl || null;

  if (req.file?.filename) {
    imageUrl = `${process.env.BACKEND_LIVE_URL}/Uploads/${req.file.filename}`;
  }

  const isPublish =
    req.body.isPublish === 'true' || req.body.isPublish === true;

  const blogdata: any = {
    ...req.body,
    userId: user.id,
    imageUrl, // Now correctly receives the Cloudinary secure_url!
    imageAltText: req.body.imageAltText || '',
    isPublish,
    metaTitle: req.body.metaTitle || req.body.title,
    metaDescription: req.body.metaDescription || '',
    keywords: req.body.keywords || '',
    tags: req.body.tags || '',
    faqs: req.body.faqs || '',
  };

  const result = await BlogServices.createBlog(blogdata);

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Blog Created Successfully',
    data: result,
  });
});

const updateBlog = catchAsync(async (req: Request, res: Response) => {
  const blogId = req.params.id;

  const existingBlog = await prisma.blog.findUnique({
    where: { id: blogId },
  });

  if (!existingBlog) {
    throw new AppError(404, 'Blog not found');
  }

  const updateddata: any = { ...req.body };

  if (req.body.isPublish !== undefined) {
    updateddata.isPublish =
      req.body.isPublish === 'true' || req.body.isPublish === true;
  }

  // Handle Cloudinary URL update or local file upload update
  if (req.body.imageUrl) {
    if (existingBlog.imageUrl && existingBlog.imageUrl.includes('/Uploads/')) {
      await deleteFile(existingBlog.imageUrl);
    }
    updateddata.imageUrl = req.body.imageUrl;
  } else if (req.file?.filename) {
    if (existingBlog.imageUrl) {
      await deleteFile(existingBlog.imageUrl);
    }
    updateddata.imageUrl = `${process.env.BACKEND_LIVE_URL}/Uploads/${req.file.filename}`;
  }

  if (req.body.imageAltText !== undefined) {
    updateddata.imageAltText = req.body.imageAltText;
  }

  const result = await BlogServices.updateBlog(blogId, updateddata);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Blog Updated Successfully',
    data: result,
  });
});

const getAllBlogs = catchAsync(async (req: Request, res: Response) => {
  const result = await BlogServices.getAllBlogs(req.query);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Blogs Fetched Successfully',
    data: result,
  });
});

const getAllBlogsAdmin = catchAsync(async (req: Request, res: Response) => {
  const result = await BlogServices.getAllBlogsAdmin(req.query);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Admin Blogs Fetched Successfully',
    data: result,
  });
});

const getBlog = catchAsync(async (req: Request, res: Response) => {
  const { slug } = req.params;
  const result = await BlogServices.getBlog(slug);

  if (!result) {
    throw new AppError(404, 'Blog not found');
  }

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Blog Fetched Successfully',
    data: result,
  });
});

const deleteBlog = catchAsync(async (req: Request, res: Response) => {
  const result = await BlogServices.deleteBlog(req.params.id);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Blog Deleted Successfully',
    data: result,
  });
});

export const BlogController = {
  createBlog,
  getAllBlogs,
  getAllBlogsAdmin,
  getBlog,
  updateBlog,
  deleteBlog,
};