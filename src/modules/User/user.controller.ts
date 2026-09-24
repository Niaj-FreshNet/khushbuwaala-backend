import { Request, Response } from 'express';
import httpStatus from 'http-status';
import { v2 as cloudinary } from 'cloudinary';
import AppError from '../../errors/AppError';
import { prisma } from '../../../prisma/client';
import catchAsync from '../../utils/catchAsync';
import { UserServices } from './user.service';
import { deleteFromCloudinary, uploadToCloudinary } from '../../utils/sendImageToCloudinary';
import sendResponse from '../../utils/sendResponse';

const getAllUsers = catchAsync(async (req: Request, res: Response) => {
  const result = await UserServices.getAllUsers((req as any).user.id, req.query);

  res.status(200).json({
    statusCode: 200,
    success: true,
    message: 'Users Fetched Successfully',
    data: result.data,
  });
});

const getUser = catchAsync(async (req: Request, res: Response) => {
  const result = await UserServices.getUser((req as any).user.id);
  const isok = !!result;

  res.status(isok ? 200 : 400).json({
    statusCode: isok ? 200 : 400,
    success: isok,
    message: isok ? 'User Fetched Successfully' : 'User Fetching Failed',
    data: isok ? result : null,
  });
});

const getUserByID = catchAsync(async (req: Request, res: Response) => {
  const result = await UserServices.getUserByID((req as any).user.id);
  const isok = !!result;

  res.status(isok ? 200 : 400).json({
    statusCode: isok ? 200 : 400,
    success: isok,
    message: isok ? 'User Fetched Successfully' : 'User Fetching Failed',
    data: isok ? result : null,
  });
});

const changePassword = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  await UserServices.changePassword(userId, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Password changed successfully',
    data: null,
  });
});

const updateUser = catchAsync(async (req: Request, res: Response) => {
  const userId = req.params.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) throw new AppError(httpStatus.NOT_FOUND, 'User not found');

  // ✅ Destructure email and district alongside other fields
  const { name, email, phone, contact, address, district } = req.body;
  let imageUrl = user.imageUrl;

  // 1. If file uploaded via Multer Memory Storage
  if (req.file) {
    if (user.imageUrl && user.imageUrl.includes('cloudinary.com')) {
      await deleteFromCloudinary(user.imageUrl).catch(() => { });
    }
    const uploaded = await uploadToCloudinary(
      req.file,
      'khushbuwaala_images/users',
      'user-avatar'
    );
    imageUrl = uploaded.location;
  }
  // 2. If Base64 string sent from Dropzone in req.body.imageUrl
  else if (req.body.imageUrl && typeof req.body.imageUrl === 'string' && req.body.imageUrl.startsWith('data:image')) {
    if (user.imageUrl && user.imageUrl.includes('cloudinary.com')) {
      await deleteFromCloudinary(user.imageUrl).catch(() => { });
    }

    const uploadRes = await cloudinary.uploader.upload(req.body.imageUrl, {
      folder: 'khushbuwaala_images/users',
      public_id: `user-avatar-${userId}-${Date.now()}`,
      resource_type: 'image',
      format: 'webp',
    });

    imageUrl = uploadRes.secure_url;
  }
  // 3. If explicit null/empty string was sent to remove avatar
  else if (req.body.imageUrl === null || req.body.imageUrl === '') {
    if (user.imageUrl && user.imageUrl.includes('cloudinary.com')) {
      await deleteFromCloudinary(user.imageUrl).catch(() => { });
    }
    imageUrl = null;
  }

  // ✅ Pass email, district, and all updated fields to UserServices
  const updatedData = {
    name,
    email,
    phone: phone || contact,
    contact: phone || contact,
    address,
    district,
    imageUrl,
    role: req.body.role,
  };

  const result = await UserServices.updateUser(userId, updatedData);

  res.status(200).json({
    statusCode: 200,
    success: true,
    message: 'User Updated Successfully',
    data: result,
  });
});

export const UserController = {
  getAllUsers,
  getUser,
  getUserByID,
  changePassword,
  updateUser,
};