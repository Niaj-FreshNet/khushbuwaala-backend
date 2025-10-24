import AppError from '../../errors/AppError';
import { deleteFile } from '../../helpers/fileDelete';
import { prisma } from '../../../prisma/client';
import catchAsync from '../../utils/catchAsync';
// import {
//   deleteFromDigitalOceanAWS,
//   uploadToDigitalOceanAWS,
// } from '../../utils/sendImageToCloudinary';
import sendResponse from '../../utils/sendResponse';
import { IBlog } from './blog.interface';
import { BlogServices } from './blog.service';

const createBlog = catchAsync(async (req, res) => {
  const user = req.user;
  let imageUrl = '';

  if (!req.file?.filename) {
    throw new AppError(400, 'At least one image is required');
  }

  if (req.file.filename) {
    imageUrl = `${process.env.BACKEND_LIVE_URL}/uploads/${req.file.filename}`;
  }

  if (req.body.isPublish && typeof req.body.isPublish === 'string') {
    req.body.isPublish = req.body.isPublish === 'true' ? true : false;
  }

  const blogdata: IBlog = {
    ...req.body,
    userId: user.id,
    imageUrl,
  };

  const result = await BlogServices.createBlog(blogdata);
  const isok = result ? true : false;
  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok ? 'Blog Created Successfully' : 'Blog Creation Failed',
    data: isok ? result : [],
  });
});

const getAllBlogs = catchAsync(async (req, res) => {
  const result = await BlogServices.getAllBlogs(req.query);
  const isok = result ? true : false;
  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok ? 'Blogs Fetched Successfully' : 'Blogs Fetching Failed',
    data: isok ? result : [],
  });
});

const getAllBlogsAdmin = catchAsync(async (req, res) => {
  const result = await BlogServices.getAllBlogsAdmin(req.query);
  const isok = result ? true : false;
  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok ? 'Blogs Fetched Successfully' : 'Blogs Fetching Failed',
    data: isok ? result : [],
  });
});

const getBlog = catchAsync(async (req, res) => {
  console.log(req.params.id);
  const result = await BlogServices.getBlog(req.params.id);
  const isok = result ? true : false;
  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok ? 'Blog Fetched Successfully' : 'Blog Fetching Failed',
    data: isok ? result : [],
  });
});

const updateBlog = catchAsync(async (req, res) => {
  const blogId = req.params.id;

  const existingBlog = await prisma.blog.findUnique({
    where: { id: blogId },
  });

  if (!existingBlog) {
    throw new AppError(404, 'Blog not found');
  }

  if (req.body.isPublish && typeof req.body.isPublish === 'string') {
    req.body.isPublish = req.body.isPublish === 'true' ? true : false;
  }

  let updateddata = { ...req.body };

  // Handle image update
  if (req.file?.filename) {
    if (existingBlog?.imageUrl) {
      await deleteFile(existingBlog.imageUrl);
    }
    updateddata.imageUrl = `${process.env.BACKEND_LIVE_URL}/uploads/${req.file.filename}`;
  }

  const result = await BlogServices.updateBlog(blogId, updateddata);
  const isok = result ? true : false;

  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok ? 'Blog Updated Successfully' : 'Blog Updation Failed',
    data: isok ? result : [],
  });
});

const deleteBlog = catchAsync(async (req, res) => {
  const result = await BlogServices.deleteBlog(req.params.id);
  const isok = result ? true : false;
  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok ? 'Blog Deleted Successfully' : 'Blog Deletion Failed',
    data: isok ? result : [],
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
