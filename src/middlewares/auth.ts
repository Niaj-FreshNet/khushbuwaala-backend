import jwt, { JwtPayload } from 'jsonwebtoken';
import { NextFunction, Response, Request } from 'express';
import { TuserRole } from '../modules/User/user.interface';
import catchAsync from '../utils/catchAsync';
import AppError from '../errors/AppError';
import config from '../config';
import { prisma } from '../../prisma/client';
import httpStatus from 'http-status';

const auth = (...requiredRoles: TuserRole[]) => {
  return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    let token =
      req.headers.authorization?.split(' ')[1] ||
      req.cookies?.accessToken;

    if (!token) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'Unauthorized: Token missing');
    }

    if (token.startsWith('Bearer ')) {
      token = token.slice(7);
    }

    try {
      const decoded = jwt.verify(
        token,
        config.access_token_secret as string
      ) as JwtPayload;

      if (!decoded || !decoded.userId) {
        throw new AppError(httpStatus.UNAUTHORIZED, 'Invalid token payload');
      }

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          imageUrl: true,
          isVerified: true,
        },
      });

      if (!user) {
        throw new AppError(httpStatus.NOT_FOUND, 'User not found');
      }

      if (requiredRoles.length && !requiredRoles.includes(user.role)) {
        throw new AppError(httpStatus.FORBIDDEN, 'You are not authorized');
      }

      (req as any).user = user;
      next();
    } catch (error: any) {
      console.error('❌ Token verification failed:', error.message);
      throw new AppError(httpStatus.UNAUTHORIZED, 'Invalid or expired token');
    }
  });
};


export default auth;
