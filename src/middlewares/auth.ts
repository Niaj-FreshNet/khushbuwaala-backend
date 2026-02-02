import jwt, { JwtPayload } from "jsonwebtoken";
import { NextFunction, Response, Request } from "express";
import { TuserRole } from "../modules/User/user.interface";
import catchAsync from "../utils/catchAsync";
import AppError from "../errors/AppError";
import config from "../config";
import { prisma } from "../../prisma/client";
import httpStatus from "http-status";

const auth = (...requiredRoles: (TuserRole | "OPTIONAL")[]) => {
  return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const allowVisitor = requiredRoles.includes("OPTIONAL");

    // ✅ Robust token extraction (Authorization header or cookie)
    const authHeaderRaw = req.headers.authorization;
    const authHeader =
      typeof authHeaderRaw === "string" ? authHeaderRaw.trim() : undefined;

    // Supports:
    // - "Bearer <token>"
    // - "<token>" (non-standard but sometimes used)
    let token =
      (authHeader
        ? authHeader.toLowerCase().startsWith("bearer ")
          ? authHeader.slice(7).trim()
          : authHeader
        : undefined) || req.cookies?.accessToken;

    // No token -> if visitor allowed, continue without error
    if (!token) {
      if (allowVisitor) {
        (req as any).user = null;
        return next();
      }
      throw new AppError(httpStatus.UNAUTHORIZED, "Unauthorized: Token missing");
    }

    try {
      const decoded = jwt.verify(
        token,
        config.access_token_secret as string
      ) as JwtPayload;

      // Your token payload expects: { userId: ... }
      if (!decoded || !decoded.userId) {
        throw new AppError(httpStatus.UNAUTHORIZED, "Invalid token payload");
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
        if (allowVisitor) {
          (req as any).user = null;
          return next();
        }
        throw new AppError(httpStatus.NOT_FOUND, "User not found");
      }

      // ✅ Role protection (unchanged behavior)
      // If OPTIONAL is included, we DO NOT enforce roles (same as your logic)
      const rolesToEnforce = requiredRoles.filter((r) => r !== "OPTIONAL");
      if (rolesToEnforce.length > 0 && !rolesToEnforce.includes(user.role)) {
        throw new AppError(httpStatus.FORBIDDEN, "You are not authorized");
      }

      (req as any).user = user;
      return next();
    } catch (error: any) {
      console.error("❌ Token verification failed:", error?.message);

      if (allowVisitor) {
        (req as any).user = null;
        return next();
      }

      throw new AppError(httpStatus.UNAUTHORIZED, "Invalid or expired token");
    }
  });
};

export default auth;
