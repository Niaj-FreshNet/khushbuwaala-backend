import { PrismaQueryBuilder } from '../../builder/QueryBuilder';
import config from '../../config';
import AppError from '../../errors/AppError';
import { prisma } from '../../../prisma/client';
import bcrypt from 'bcrypt';
import httpStatus from 'http-status';

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
      contact: true,
      imageUrl: true,
      address: true,
      district: true,
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

  // 1. Fetch user including their existing hashed password
  const user = await prisma.user.findUnique({
    where: { id },
  });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  // ✅ Guard check: Ensure user actually has an existing password set
  if (!user.password) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'This account does not have a password set. Please use password reset or social login.'
    );
  }

  // 2. TypeScript now narrows user.password to type 'string'
  const isPasswordMatched = await bcrypt.compare(oldPassword, user.password);
  if (!isPasswordMatched) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Current password is incorrect');
  }

  // 3. Prevent reusing the exact same password
  const isSamePassword = await bcrypt.compare(newPassword, user.password);
  if (isSamePassword) {
    throw new AppError(httpStatus.BAD_REQUEST, 'New password cannot be the same as your current password');
  }

  // 4. Hash and save new password
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

  return true;
};

const updateUser = async (id: string, data: any) => {
  const updateData: Record<string, any> = {};

  if (data.name !== undefined) updateData.name = String(data.name).trim();
  if (data.address !== undefined) updateData.address = String(data.address).trim();
  if (data.district !== undefined) updateData.district = String(data.district).trim(); // ✅ Allow district
  if (data.imageUrl !== undefined) updateData.imageUrl = data.imageUrl;

  // ✅ Handle Email update & prevent duplicates
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

  // Accept either phone or contact from payload and save to prisma's phone field
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