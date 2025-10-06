import AppError from '../../errors/AppError';
import { deleteFile } from '../../helpers/fileDelete';
import { prisma } from '../../../prisma/client';
import catchAsync from '../../utils/catchAsync';
import {
  deleteFromDigitalOceanAWS,
  uploadToDigitalOceanAWS,
} from '../../utils/sendImageToCloudinary';
import { UserServices } from './user.service';

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
  const userId = req.params.id; // <-- use params
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) throw new AppError(404, 'User not found');

  const { name, contact, address } = req.body;
  let imageUrl = user.imageUrl;

  if (req.file?.filename) {
    if (user.imageUrl) await deleteFile(user.imageUrl);
    imageUrl = `${process.env.BACKEND_LIVE_URL}/uploads/${req.file.filename}`;
  }

  const updatedData = { name, contact, address, imageUrl, role: req.body.role };

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
  changePassword,
  updateUser,
};
