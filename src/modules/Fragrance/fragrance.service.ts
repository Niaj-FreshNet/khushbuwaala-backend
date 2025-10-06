import { PrismaQueryBuilder } from '../../builder/QueryBuilder';
import AppError from '../../errors/AppError';
import { prisma } from '../../../prisma/client';
import { IFragrance } from './fragrance.interface';

const createFragrance = async (payload: IFragrance) => {
  const isFragranceExist = await prisma.fragrance.findFirst({
    where: {
      fragranceName: payload.fragranceName,
    },
  });

  if (isFragranceExist) {
    throw new AppError(403, 'Fragrance already exists');
  }
  const result = await prisma.fragrance.create({
    data: {
      fragranceName: payload.fragranceName,
      imageUrl: payload.imageUrl,
    },
  });
  return result;
};

const getAllFragrances = async (queryParams: Record<string, unknown>) => {
  const queryBuilder = new PrismaQueryBuilder(queryParams, ['fragranceName'])
    .buildWhere()
    .buildSort()
    .buildPagination()
    .buildSelect();

  const materials = await prisma.fragrance.findMany(queryBuilder.getQuery());

  const meta = await queryBuilder.getPaginationMeta(prisma.fragrance);

  return {
    data: materials,
    meta,
  };
};

const getFragrance = async (id: string) => {
  const result = await prisma.fragrance.findUnique({
    where: {
      id,
    },
  });
  return result;
};

const updateFragrance = async (id: string, payload: IFragrance) => {
  const isFragranceExist = await prisma.fragrance.findUnique({
    where: {
      id,
    },
  });
  if (!isFragranceExist) {
    throw new AppError(400, 'Fragrance not found');
  }

  const result = await prisma.fragrance.update({
    where: {
      id,
    },
    data: {
      fragranceName: payload.fragranceName,
    },
  });
  return result;
};

const deleteFragrance = async (id: string) => {
  const isFragranceExist = await prisma.fragrance.findUnique({
    where: {
      id,
    },
  });
  if (!isFragranceExist) {
    throw new AppError(400, 'Fragrance not found');
  }

  const result = await prisma.fragrance.delete({
    where: {
      id,
    },
  });
  return result;
};

export const FragranceServices = {
  createFragrance,
  getAllFragrances,
  getFragrance,
  updateFragrance,
  deleteFragrance,
};
