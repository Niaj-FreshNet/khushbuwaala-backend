import { PrismaQueryBuilder } from '../../builder/QueryBuilder';
import AppError from '../../errors/AppError';
import { prisma } from '../../../prisma/client';
import { IMAterial } from './material.interface';

const createMaterial = async (payload: IMAterial) => {
  const isMaterialExist = await prisma.material.findFirst({
    where: {
      materialName: payload.materialName,
    },
  });

  if (isMaterialExist) {
    throw new AppError(403, 'Material already exists');
  }
  const result = await prisma.material.create({
    data: {
      materialName: payload.materialName,
      imageUrl: payload.imageUrl,
    },
  });
  return result;
};

const getAllMaterials = async (queryParams: Record<string, unknown>) => {
  const queryBuilder = new PrismaQueryBuilder(queryParams, ['materialName'])
    .buildWhere()
    .buildSort()
    .buildPagination()
    .buildSelect();

  const materials = await prisma.material.findMany(queryBuilder.getQuery());

  const meta = await queryBuilder.getPaginationMeta(prisma.material);

  return {
    data: materials,
    meta,
  };
};

const getMaterial = async (id: string) => {
  const result = await prisma.material.findUnique({
    where: {
      id,
    },
  });
  return result;
};

const updateMaterial = async (id: string, payload: IMAterial) => {
  const isMaterialExist = await prisma.material.findUnique({
    where: {
      id,
    },
  });
  if (!isMaterialExist) {
    throw new AppError(400, 'Material not found');
  }

  const result = await prisma.material.update({
    where: {
      id,
    },
    data: {
      materialName: payload.materialName,
    },
  });
  return result;
};

const deleteMaterial = async (id: string) => {
  const isMaterialExist = await prisma.material.findUnique({
    where: {
      id,
    },
  });
  if (!isMaterialExist) {
    throw new AppError(400, 'Material not found');
  }

  const result = await prisma.material.delete({
    where: {
      id,
    },
  });
  return result;
};

export const MaterialServices = {
  createMaterial,
  getAllMaterials,
  getMaterial,
  updateMaterial,
  deleteMaterial,
};
