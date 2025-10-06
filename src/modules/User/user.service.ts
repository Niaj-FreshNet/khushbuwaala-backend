import { PrismaQueryBuilder } from '../../builder/QueryBuilder';
import config from '../../config';
import AppError from '../../errors/AppError';
import { prisma } from '../../../prisma/client';
import bcrypt from 'bcrypt';

const getAllUsers = async (
  id: string,
  queryParams: Record<string, unknown>,
) => {
  const queryBuilder = new PrismaQueryBuilder(queryParams, ['name']);
  queryBuilder.buildWhere().buildSort().buildPagination().buildSelect();

  // Get the generated query object
  const prismaQuery = queryBuilder.getQuery();

  // Merge NOT condition into the existing where clause
  prismaQuery.where = {
    AND: [prismaQuery.where || {}, { NOT: { id } }],
  };

  // Ensure select fields fallback if not defined by client
  if (!prismaQuery.select) {
    prismaQuery.select = {
      id: true,
      name: true,
      email: true,
      role: true,
      contact: true,
      imageUrl: true,
      address: true,
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
    where: {
      id,
    },
    select: {
      name: true,
      email: true,
      contact: true,
      imageUrl: true,
      address: true,
    },
  });
  return result;
};

const changePassword = async (id: string, newPassword: string) => {
  const user = await prisma.user.findUnique({
    where: {
      id,
    },
  });

  if (!user) {
    throw new AppError(404, 'User not found');
  }
  const hashedPassword = await bcrypt.hash(
    newPassword,
    Number(config.salt_round),
  );
  const result = await prisma.user.update({
    where: {
      id,
    },
    data: {
      password: hashedPassword,
    },
  });
  return true;
};

const updateUser = async (id: string, data: any) => {
  const result = await prisma.user.update({
    where: {
      id,
    },
    data,
    select: {
      name: true,
      email: true,
      role: true,
      contact: true,
      imageUrl: true,
      address: true,
    },
  });
  return result;
};

export const UserServices = {
  getUser,
  changePassword,
  updateUser,
  getAllUsers,
};
