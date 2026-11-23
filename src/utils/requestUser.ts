import type { Request } from 'express';
import httpStatus from 'http-status';
import AppError from '../errors/AppError';
import type { AuthUser } from '../types';

/** The signed-in user on a route guarded by auth(...). A 401 instead of a crash if it is missing. */
export const requireUser = (req: Request): AuthUser => {
  if (!req.user) throw new AppError(httpStatus.UNAUTHORIZED, 'Please log in again');
  return req.user;
};
