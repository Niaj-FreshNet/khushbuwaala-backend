import { v2 as cloudinary } from 'cloudinary';
import AppError from '../../errors/AppError';
import { deleteFile } from '../../helpers/fileDelete';
import { prisma } from '../../../prisma/client';
import catchAsync from '../../utils/catchAsync';
import { UserServices } from './user.service';
import { deleteFromCloudinary, uploadToCloudinary } from '../../utils/sendImageToCloudinary';

const getAllUsers = catchAsync(async (req, res) => {
  const result = await UserServices.getAllUsers(req.user.id, req.query);

  res.status(200).json({
    statusCode: 200,
    success: true,
    message: 'Users Fetched Successfully',
    data: result.data, // <-- return only the array
  });
});

const getUser = catchAsync(async (req, res) => {
  const result = await UserServices.getUser(req.user.id);
  const isok = result ? true : false;
  res.status(isok ? 200 : 400).json({
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok ? 'User Fetched Successfully' : 'User Fetching Failed',
    data: isok ? result : [],
  });
});

const getUserByID = catchAsync(async (req, res) => {
  const result = await UserServices.getUserByID(req.user.id);
  const isok = result ? true : false;
  res.status(isok ? 200 : 400).json({
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok ? 'User Fetched Successfully' : 'User Fetching Failed',
    data: isok ? result : [],
  });
});

const changePassword = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const { newPassword } = req.body;
  const result = await UserServices.changePassword(userId, newPassword);
  const isok = result ? true : false;
  res.status(isok ? 200 : 400).json({
    statusCode: isok ? 200 : 400,
    success: isok ? true : false,
    message: isok ? 'Password Changed Successfully' : 'Password Change Failed',
    data: isok ? result : [],
  });
});

const updateUser = catchAsync(async (req, res) => {
  const userId = req.params.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) throw new AppError(404, 'User not found');

  const { name, phone, contact, address } = req.body;
  let imageUrl = user.imageUrl;

  // 1. If file uploaded via Multer Memory Storage (Passing 3 arguments: file, folder, prefix)
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

  const updatedData = {
    name,
    phone: phone || contact,
    contact: phone || contact,
    address,
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
