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
  let imageUrl = '';

  if (!req.file?.filename) {
    throw new AppError(400, 'Image is required for blog creation');
  }

  imageUrl = `${process.env.BACKEND_LIVE_URL}/Uploads/${req.file.filename}`;

  const isPublish =
    req.body.isPublish === 'true' || req.body.isPublish === true;

  const blogdata: IBlog = {
    ...req.body,
    userId: user.id,
    imageUrl,
    isPublish,
    metaTitle: req.body.metaTitle || req.body.title,
    metaDescription: req.body.metaDescription || '',
    keywords: req.body.keywords || '',
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

  const updateddata: Partial<IBlog> = { ...req.body };

  if (req.body.isPublish !== undefined) {
    updateddata.isPublish =
      req.body.isPublish === 'true' || req.body.isPublish === true;
  }

  if (req.file?.filename) {
    if (existingBlog.imageUrl) {
      await deleteFile(existingBlog.imageUrl);
    }
    updateddata.imageUrl = `${process.env.BACKEND_LIVE_URL}/Uploads/${req.file.filename}`;
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
  const { slug } = req.params; // FIXED: reading 'slug' rather than nonexistent 'id'
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