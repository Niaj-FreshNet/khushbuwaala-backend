import httpStatus from 'http-status';
import { Prisma } from '@prisma/client';
import { prisma } from '../../../prisma/client';
import AppError from '../../errors/AppError';
import { cleanSettings, withDefaults } from './storefront.settings';

// One document holds the storefront's editable content.
const KEY = 'storefront';

const getSettings = async () => {
  const row = await prisma.storefrontSetting.findFirst({ where: { key: KEY }, orderBy: { updatedAt: 'desc' } });
  return { settings: withDefaults(row?.data), updatedAt: row?.updatedAt ?? null, usingDefaults: !row };
};

const saveSettings = async (input: unknown, userId: string) => {
  const { settings, problems } = cleanSettings(input);
  // Nothing is saved unless everything sent could be kept: a half-saved home page is worse than an error.
  if (problems.length) throw new AppError(httpStatus.BAD_REQUEST, problems.join(' '));
  if (!settings.hero.length) throw new AppError(httpStatus.BAD_REQUEST, 'Keep at least one banner.');
  if (!settings.homeRows.some((r) => r.enabled)) throw new AppError(httpStatus.BAD_REQUEST, 'Keep at least one product row switched on.');

  const data = settings as unknown as Prisma.InputJsonValue;
  const existing = await prisma.storefrontSetting.findFirst({ where: { key: KEY }, orderBy: { updatedAt: 'desc' }, select: { id: true } });
  const row = existing
    ? await prisma.storefrontSetting.update({ where: { id: existing.id }, data: { data, updatedById: userId } })
    : await prisma.storefrontSetting.create({ data: { key: KEY, data, updatedById: userId } });
  return { settings: withDefaults(row.data), updatedAt: row.updatedAt, usingDefaults: false };
};

export const StorefrontServices = { getSettings, saveSettings };
