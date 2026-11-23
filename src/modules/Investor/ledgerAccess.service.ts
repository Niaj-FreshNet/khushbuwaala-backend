import httpStatus from 'http-status';
import { prisma } from '../../../prisma/client';
import AppError from '../../errors/AppError';
import { LedgerAccessStatus, Prisma } from '@prisma/client';
import { isEnumValue } from '../../utils/enumValue';

/**
 * Investor access to the full company ledger (DECISIONS D-007).
 * Summaries are always visible. The full ledger needs a request that SUPER_ADMIN approves
 * each time, for a limited window. Enforced in the Finance ledger controller.
 */

const DEFAULT_HOURS = 24;
const MAX_HOURS = 24 * 7;

const startOfDhakaMonthUtc = () => {
  const dhakaNow = new Date(Date.now() + 6 * 3600 * 1000);
  return new Date(Date.UTC(dhakaNow.getUTCFullYear(), dhakaNow.getUTCMonth(), 1) - 6 * 3600 * 1000);
};

const activeGrant = (userId: string) =>
  prisma.ledgerAccessRequest.findFirst({
    where: { userId, status: 'APPROVED', expiresAt: { gt: new Date() } },
    orderBy: { expiresAt: 'desc' },
  });

const hasActiveAccess = async (userId: string) => !!(await activeGrant(userId));

const requestAccess = async (userId: string, reason?: string) => {
  const investor = await prisma.investor.findUnique({ where: { userId } });
  if (!investor) throw new AppError(httpStatus.FORBIDDEN, 'Only investors can request ledger access.');

  const grant = await activeGrant(userId);
  if (grant) {
    throw new AppError(httpStatus.BAD_REQUEST, `You already have access until ${grant.expiresAt?.toISOString()}.`);
  }
  const pending = await prisma.ledgerAccessRequest.findFirst({ where: { userId, status: 'PENDING' } });
  if (pending) return pending; // one open request at a time

  return prisma.ledgerAccessRequest.create({
    data: { userId, reason: reason?.toString().trim().slice(0, 500) || null },
  });
};

const myStatus = async (userId: string) => {
  const [grant, pending, approvedThisMonth] = await Promise.all([
    activeGrant(userId),
    prisma.ledgerAccessRequest.findFirst({ where: { userId, status: 'PENDING' }, orderBy: { requestedAt: 'desc' } }),
    prisma.ledgerAccessRequest.count({ where: { userId, status: 'APPROVED', decidedAt: { gte: startOfDhakaMonthUtc() } } }),
  ]);
  return {
    hasAccess: !!grant,
    expiresAt: grant?.expiresAt ?? null,
    pendingRequest: pending ? { id: pending.id, requestedAt: pending.requestedAt } : null,
    approvedThisMonth,
  };
};

const listRequests = async (status?: string) => {
  const where: Prisma.LedgerAccessRequestWhereInput = isEnumValue(LedgerAccessStatus, status) ? { status } : {};
  const requests = await prisma.ledgerAccessRequest.findMany({ where, orderBy: { requestedAt: 'desc' }, take: 100 });
  const userIds = [...new Set(requests.map((r) => r.userId))];
  const [users, monthCounts] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }),
    prisma.ledgerAccessRequest.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds }, status: 'APPROVED', decidedAt: { gte: startOfDhakaMonthUtc() } },
      _count: { _all: true },
    }),
  ]);
  const userMap = new Map(users.map((u) => [u.id, u]));
  const countMap = new Map(monthCounts.map((c) => [c.userId, c._count._all]));
  const now = new Date();
  return requests.map((r) => ({
    ...r,
    user: userMap.get(r.userId) ?? null,
    approvedThisMonth: countMap.get(r.userId) ?? 0,
    isActive: r.status === 'APPROVED' && !!r.expiresAt && r.expiresAt > now,
  }));
};

const decide = async (id: string, status: 'APPROVED' | 'REJECTED', hours: number | undefined, adminId: string) => {
  if (status !== 'APPROVED' && status !== 'REJECTED') {
    throw new AppError(httpStatus.BAD_REQUEST, 'Status must be APPROVED or REJECTED.');
  }
  const request = await prisma.ledgerAccessRequest.findUnique({ where: { id } });
  if (!request) throw new AppError(httpStatus.NOT_FOUND, 'Request not found.');
  if (request.status !== 'PENDING') throw new AppError(httpStatus.BAD_REQUEST, `This request was already ${request.status.toLowerCase()}.`);

  const h = Math.min(MAX_HOURS, Math.max(1, Math.round(Number(hours) || DEFAULT_HOURS)));
  const now = new Date();
  return prisma.ledgerAccessRequest.update({
    where: { id },
    data: {
      status,
      decidedAt: now,
      decidedById: adminId,
      expiresAt: status === 'APPROVED' ? new Date(now.getTime() + h * 3600 * 1000) : null,
    },
  });
};

// Ends an active window early.
const revoke = async (id: string) => {
  const request = await prisma.ledgerAccessRequest.findUnique({ where: { id } });
  if (!request || request.status !== 'APPROVED') throw new AppError(httpStatus.BAD_REQUEST, 'Only an approved request can be revoked.');
  return prisma.ledgerAccessRequest.update({ where: { id }, data: { expiresAt: new Date() } });
};

export const LedgerAccessServices = { hasActiveAccess, requestAccess, myStatus, listRequests, decide, revoke };
