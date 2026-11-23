import { PrismaQueryBuilder } from '../../builder/QueryBuilder';
import config from '../../config';
import AppError from '../../errors/AppError';
import { prisma } from '../../../prisma/client';
import bcrypt from 'bcrypt';
import httpStatus from 'http-status';
import { sendPasswordChangeNotificationEmail } from '../../helpers/emailSender/emails';
import type { Prisma } from '@prisma/client';

const getAllUsers = async (
  id: string,
  queryParams: Record<string, unknown>,
) => {
  // staffOnly=true: every non-customer account (the role screen used to get only the newest 10
  // accounts and then hide customers, so older staff/investors were missing).
  const { staffOnly, ...rest } = queryParams;
  const queryBuilder = new PrismaQueryBuilder(rest, ['name', 'email', 'phone']);
  queryBuilder.buildWhere().buildSort().buildPagination().buildSelect();

  const prismaQuery = queryBuilder.getQuery();

  prismaQuery.where = {
    AND: [
      prismaQuery.where || {},
      { NOT: { id } },
      ...(String(staffOnly) === 'true' ? [{ role: { not: 'USER' as const } }] : []),
    ],
  };

  if (!prismaQuery.select) {
    prismaQuery.select = {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      isApproved: true,
      // 🚨 Include the relation to pull the percentage!
      investor: {
        select: { profitSharePercentage: true }
      },
      createdAt: true,
    };
  }

  const result = await prisma.user.findMany(prismaQuery);
  const meta = await queryBuilder.getPaginationMeta((where) => prisma.user.count({ where }));

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
  if (String(newPassword).length < 6) {
    throw new AppError(httpStatus.BAD_REQUEST, 'New password must be at least 6 characters');
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
    // 400, not 401: the admin treats 401 as "session expired" and would sign the user out.
    throw new AppError(httpStatus.BAD_REQUEST, 'Current password is incorrect');
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

// Profile fields a user (or an admin for them) may change; anything else in the body is ignored
type ProfileUpdate = { name?: unknown; address?: unknown; district?: unknown; imageUrl?: unknown; email?: unknown; phone?: unknown; contact?: unknown };

const updateUser = async (id: string, data: ProfileUpdate) => {
  const updateData: Prisma.UserUpdateInput = {};

  if (data.name !== undefined) updateData.name = String(data.name).trim();
  if (data.address !== undefined) updateData.address = String(data.address).trim();
  if (data.district !== undefined) updateData.district = String(data.district).trim();
  if (data.imageUrl !== undefined) updateData.imageUrl = data.imageUrl === null ? null : String(data.imageUrl);

  // Role is never changed through profile updates (see PATCH /auth/approve-role).

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