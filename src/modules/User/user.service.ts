import { PrismaQueryBuilder } from '../../builder/QueryBuilder';
import config from '../../config';
import AppError from '../../errors/AppError';
import { prisma } from '../../../prisma/client';
import bcrypt from 'bcrypt';
import httpStatus from 'http-status';
import { sendPasswordChangeNotificationEmail } from '../../helpers/emailSender/emails';

const getAllUsers = async (
  id: string,
  queryParams: Record<string, unknown>,
) => {
  const queryBuilder = new PrismaQueryBuilder(queryParams, ['name']);
  queryBuilder.buildWhere().buildSort().buildPagination().buildSelect();

  const prismaQuery = queryBuilder.getQuery();

  prismaQuery.where = {
    AND: [prismaQuery.where || {}, { NOT: { id } }],
  };

  if (!prismaQuery.select) {
    prismaQuery.select = {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      imageUrl: true,
      address: true,
      district: true,
      createdAt: true,
    };
  }

  const result = await prisma.user.findMany(prismaQuery);
  const meta = await queryBuilder.getPaginationMeta(prisma.user);

  return {
    meta,
    data: result,
  };
};

const getUser = async (id: string) => {
  const result = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      imageUrl: true,
      address: true,
      district: true,
      createdAt: true, // ✅ Added so details page gets creation date
    },
  });
  return result;
};

const getUserByID = async (id: string) => {
  const result = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      imageUrl: true,
      address: true,
      district: true,
      createdAt: true,
    },
  });
  return result;
};

const changePassword = async (
  id: string,
  payload: { oldPassword?: string; newPassword?: string }
) => {
  const { oldPassword, newPassword } = payload;

  if (!oldPassword || !newPassword) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Both current and new passwords are required');
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      password: true,
    },
  });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  if (!user.password) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'This account does not have a password set. Please use password reset or social login.'
    );
  }

  const isPasswordMatched = await bcrypt.compare(oldPassword, user.password);
  if (!isPasswordMatched) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Current password is incorrect');
  }

  const isSamePassword = await bcrypt.compare(newPassword, user.password);
  if (isSamePassword) {
    throw new AppError(httpStatus.BAD_REQUEST, 'New password cannot be the same as your current password');
  }

  const hashedPassword = await bcrypt.hash(
    newPassword,
    Number(config.salt_round),
  );

  await prisma.user.update({
    where: { id },
    data: {
      password: hashedPassword,
    },
  });

  if (user.email) {
    sendPasswordChangeNotificationEmail(user.email, user.name).catch((err) => {
      console.error('Password change email error:', err);
    });
  }

  return true;
};

const updateUser = async (id: string, data: any) => {
  const updateData: Record<string, any> = {};

  if (data.name !== undefined) updateData.name = String(data.name).trim();
  if (data.address !== undefined) updateData.address = String(data.address).trim();
  if (data.district !== undefined) updateData.district = String(data.district).trim();
  if (data.imageUrl !== undefined) updateData.imageUrl = data.imageUrl;

  // ✅ Added Role update support so admin promotions/demotions persist
  if (data.role !== undefined) {
    const validRoles = ['USER', 'ADMIN', 'SUPER_ADMIN'];
    if (!validRoles.includes(data.role)) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Invalid user role specified');
    }
    updateData.role = data.role;
  }

  if (data.email !== undefined) {
    const cleanEmail = String(data.email).trim().toLowerCase();

    const existing = await prisma.user.findFirst({
      where: {
        email: cleanEmail,
        NOT: { id },
      },
    });

    if (existing) {
      throw new AppError(httpStatus.CONFLICT, 'Email is already in use by another account');
    }

    updateData.email = cleanEmail;
  }

  const incomingPhone = data.phone !== undefined ? data.phone : data.contact;
  if (incomingPhone !== undefined) {
    updateData.phone = String(incomingPhone).trim();
  }

  const result = await prisma.user.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      imageUrl: true,
      address: true,
      district: true,
      createdAt: true,
    },
  });

  return result;
};

export const UserServices = {
  getUser,
  getUserByID,
  changePassword,
  updateUser,
  getAllUsers,
};