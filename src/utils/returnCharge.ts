import httpStatus from 'http-status';
import { OrderStatus } from '@prisma/client';
import AppError from '../errors/AppError';

/** Upper-cased status if it is a real OrderStatus, else a 400 (a typo used to reach Prisma as a 500). */
export const parseOrderStatus = (value: unknown): OrderStatus => {
  const status = String(value || '').toUpperCase();
  if (!(Object.values(OrderStatus) as string[]).includes(status)) {
    throw new AppError(httpStatus.BAD_REQUEST, `Invalid order status: ${value}`);
  }
  return status as OrderStatus;
};

/**
 * Optional, for a parcel that came back from the courier (D-025): the delivery charge the customer
 * still paid (CANCELED = paid, RETURNED = not paid). undefined = not sent, null = clear it.
 * Used by the order status change and the sale edit, so both follow the same rule.
 */
export const parseReturnCharge = (
  payload: { returnChargeCollected?: unknown } | undefined,
  status: string | undefined,
): number | null | undefined => {
  if (!payload || !('returnChargeCollected' in payload)) return undefined;
  const v = payload.returnChargeCollected;
  if (v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new AppError(httpStatus.BAD_REQUEST, 'Delivery charge collected must be 0 or more');
  if (status !== 'CANCELED' && status !== 'RETURNED') {
    throw new AppError(httpStatus.BAD_REQUEST, 'Delivery charge collected only applies to a cancelled or returned order');
  }
  return n;
};
