import config from '../../config';

import { prisma } from '../../../prisma/client';
import { ILoginUser, IUser, IUserPayload } from './auth.interface';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { Role } from '@prisma/client';
import { createToken, verifyToken } from './auth.utils';
import {
  sendPasswordResetEmail,
  sendRoleApprovalEmail,
  sendRoleRejectionEmail,
  sendVerificationEmail,
} from '../../helpers/emailSender/emails';
import AppError from '../../errors/AppError';

// Inside auth.service.ts

const register = async (payload: IUser & { role?: Role }) => {
  const email = (payload.email ?? "").trim().toLowerCase();

  if (!email) {
    throw new AppError(400, "Email is required");
  }

  if (!payload.password) {
    throw new AppError(400, "Password is required");
  }

  const hashedPassword = await bcrypt.hash(
    payload.password,
    Number(config.salt_round)
  );

  const verificationToken = Math.floor(100000 + Math.random() * 900000).toString();
  const verificationTokenExpiry = new Date(Date.now() + 15 * 60 * 1000);

  // Determine role requested. If ADMIN, SALESMAN, or INVESTOR, they require Super Admin approval.
  // Standard users (USER) are auto-approved, while admin/salesman/investor require approval.
  const requestedRole = (payload.role as Role) || Role.USER;
  const requiresApproval = requestedRole !== Role.USER;

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  let result;

  if (existingUser) {
    if (existingUser.password && existingUser.isVerified) {
      throw new AppError(400, "User already exists with this email. Please log in.");
    }

    result = await prisma.user.update({
      where: { email },
      data: {
        name: payload.name || existingUser.name,
        password: hashedPassword,
        role: requestedRole,
        isApproved: !requiresApproval, // false for Admin/Salesman/Investor until Super Admin approves
        verificationToken,
        verificationTokenExpiry,
        isVerified: false,
      },
    });
  } else {
    result = await prisma.user.create({
      data: {
        ...payload,
        email,
        password: hashedPassword,
        role: requestedRole,
        isApproved: !requiresApproval, // false until approved by Super Admin
        verificationToken,
        verificationTokenExpiry,
        isVerified: false,
      },
    });
  }

  try {
    await sendVerificationEmail(email, verificationToken);
  } catch (error) {
    console.error("Warning: Failed to send verification email to", email, error);
  }

  return result;
};

const verifyEmail = async (email: string, token: string) => {
  const user = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (!user) {
    throw new AppError(404, 'User not found');
  }

  if (user.verificationToken !== token || !user.verificationTokenExpiry) {
    throw new AppError(400, 'Invalid verification token');
  }

  if (user?.verificationTokenExpiry < new Date()) {
    throw new AppError(401, 'Verification token has expired');
  }

  const updatedUser = await prisma.user.update({
    where: {
      email,
    },
    data: {
      isVerified: true,
      verificationToken: null,
      verificationTokenExpiry: null,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      imageUrl: true,
    },
  });

  const JwtPayload = {
    email: user.email,
    userId: user?.id,
    role: user.role,
  };

  //create toke and send to the client
  const accessToken = createToken(
    JwtPayload,
    config.access_token_secret as string,
    config.access_token_expires as string,
  );

  const refreshToken = createToken(
    JwtPayload,
    config.refresh_token_secret as string,
    config.refresh_token_expires as string,
  );

  return {
    message: 'User verified successfully',
    updatedUser,
    accessToken,
    refreshToken,
  };
};

const login = async (payload: ILoginUser) => {
  const user = await prisma.user.findUnique({
    where: {
      email: payload.email,
    },
    select: {
      id: true,
      email: true,
      name: true,
      password: true,
      role: true,
      isVerified: true,
      isApproved: true, // 👈 Make sure to select this field to check approval status
      imageUrl: true,
    },
  });

  // Same answer for "no such account" and "wrong password", and the password is checked
  // before anything about the account (verified / approval) is revealed.
  const isPasswordMatched: boolean =
    !!user?.password && !!payload.password && (await bcrypt.compare(String(payload.password), user.password));

  if (!user || !isPasswordMatched) {
    throw new AppError(401, 'Invalid email or password');
  }

  if (!user.isVerified) {
    throw new AppError(401, 'Please verify your email address first.');
  }

  // ✅ Check if Super Admin approval is pending for Admin/Salesman/Investor roles
  if (user.role !== Role.USER && user.isApproved === false) {
    throw new AppError(403, 'Your Access Role Approval is Pending.');
  }

  const JwtPayload = {
    email: user.email,
    userId: user?.id,
    role: user.role,
  };

  const accessToken = createToken(
    JwtPayload,
    config.access_token_secret as string,
    config.access_token_expires as string,
  );

  const refreshToken = createToken(
    JwtPayload,
    config.refresh_token_secret as string,
    config.refresh_token_expires as string,
  );

  return {
    user,
    accessToken,
    refreshToken,
  };
};

const forgotPassword = async (email: string) => {
  if (!email) {
    throw new AppError(400, 'Email is required');
  }
  email = String(email).trim().toLowerCase(); // accounts are stored lower-case
  const user = await prisma.user.findUnique({
    where: { email },
  });

  // Same answer whether or not the account exists (don't reveal who is registered).
  if (!user) {
    return true;
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  const tokenExpiry = new Date(Date.now() + 1000 * 60 * 15); // 15 minutes

  const baseUrl = config.live_url || 'https://khushbuwaala.com';

  // If your frontend file is at app/reset-password/[token]/page.tsx, structure it like this:
  const link = `${baseUrl}/reset-password/${resetToken}`;


  // Save the token first, so the emailed link always works.
  await prisma.user.update({
    where: { email },
    data: {
      resetToken,
      resetTokenExpiry: tokenExpiry,
    },
  });

  try {
    await sendPasswordResetEmail(email, link);
  } catch (error) {
    console.error('Warning: failed to send password reset email', error);
  }

  return true;
};

export const resetPassword = async (
  token: string,
  password: string,
) => {
  const user = await prisma.user.findFirst({
    where: {
      resetToken: token,
    },
  });

  if (!user) {
    throw new AppError(404, 'Invalid or expired reset token');
  }

  if (!user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
    throw new AppError(400, 'Reset token has expired');
  }

  const hashedPassword = await bcrypt.hash(password, Number(config.salt_round));

  await prisma.user.update({
    where: {
      id: user.id,
    },
    data: {
      password: hashedPassword,
      resetToken: null,
      resetTokenExpiry: null,
    },
  });

  return true;
};

const changePassword = async (
  email: string,
  oldPassword: string,
  newPassword: string,
) => {
  const user = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (!user) {
    throw new AppError(400, 'User not found with this email');
  }
  if (!user.password) {
    throw new AppError(400, 'Password is required');
  }

  const isPasswordMatched: boolean = await bcrypt.compare(
    oldPassword,
    user?.password!,
  );

  if (!isPasswordMatched) {
    throw new AppError(400, 'Invalid credentials password not matched!');
  }

  const hashedPassword = await bcrypt.hash(
    newPassword,
    Number(config.salt_round),
  );

  await prisma.user.update({
    where: {
      email,
    },
    data: {
      password: hashedPassword,
    },
  });

  return true;
};

const refreshToken = async (refreshToken: string) => {
  if (!refreshToken) {
    throw new AppError(401, 'Refresh token is required');
  }
  const decoded = verifyToken(
    refreshToken,
    config.refresh_token_secret as string,
  );

  if (!decoded) {
    throw new AppError(401, 'Invalid or expired refresh token!');
  }
  // console.log(decoded);

  const user = await prisma.user.findUnique({
    where: {
      id: decoded.userId,
    },
  });

  if (!user) {
    throw new AppError(400, 'User not found with this refresh token');
  }

  const JwtPayload = {
    email: user.email,
    userId: user.id,
    role: user.role,
  };

  //create toke and send to the client
  const accessToken = createToken(
    JwtPayload,
    config.access_token_secret as string,
    config.access_token_expires as string,
  );

  return { accessToken };
};

const resendVerifyEmail = async (email: string) => {
  const user = await prisma.user.findUnique({
    where: {
      email,
    },
  });
  if (!user) {
    throw new AppError(400, 'User not found with this email');
  }

  if (user.isVerified) {
    throw new AppError(400, 'User is already verified');
  }

  const verificationToken = Math.floor(
    100000 + Math.random() * 900000,
  ).toString();
  const verificationTokenExpiry = new Date(Date.now() + 15 * 60 * 1000);

  await prisma.user.update({
    where: { email },
    data: {
      verificationToken,
      verificationTokenExpiry,
    },
  });

  sendVerificationEmail(user.email, verificationToken);

  return true;
};

const makeAdmin = async (payload: IUserPayload) => {
  const { name, email, password } = payload;

  let user = await prisma.user.findUnique({ where: { email } });
  let result;

  if (user) {
    result = await prisma.user.update({ where: { email }, data: { role: Role.ADMIN } });
  } else {
    result = await prisma.user.create({
      data: {
        name,
        email,
        password: await bcrypt.hash(password, Number(config.salt_round)),
        isVerified: true,
        role: Role.ADMIN,
      },
    });
  }

  const JwtPayload = { email: result.email, userId: result.id, role: result.role };
  const accessToken = createToken(JwtPayload, config.access_token_secret!, config.access_token_expires!);
  const refreshToken = createToken(JwtPayload, config.refresh_token_secret!, config.refresh_token_expires!);

  return { result, accessToken, refreshToken };
};

const makeSalesman = async (payload: IUserPayload) => {
  const { name, email, password } = payload;

  let user = await prisma.user.findUnique({ where: { email } });
  let result;

  if (user) {
    result = await prisma.user.update({ where: { email }, data: { role: Role.SALESMAN } });
  } else {
    result = await prisma.user.create({
      data: {
        name,
        email,
        password: await bcrypt.hash(password, Number(config.salt_round)),
        isVerified: true,
        role: Role.SALESMAN,
      },
    });
  }

  const JwtPayload = { email: result.email, userId: result.id, role: result.role };
  const accessToken = createToken(JwtPayload, config.access_token_secret!, config.access_token_expires!);
  const refreshToken = createToken(JwtPayload, config.refresh_token_secret!, config.refresh_token_expires!);

  return { result, accessToken, refreshToken };
};

const approveOrUpdateUserRole = async (
  adminUserId: string,
  payload: {
    userId: string;
    role: Role;
    isApproved: boolean;
    investorProfitPercentage?: number;
    totalInvested?: number;
    currentBalance?: number;
  }
) => {
  if (!adminUserId) {
    throw new AppError(401, "Unauthorized: Admin ID is missing.");
  }

  const { userId, role, isApproved, investorProfitPercentage, totalInvested, currentBalance } = payload;

  const admin = await prisma.user.findUnique({ where: { id: adminUserId } });
  if (!admin || admin.role !== 'SUPER_ADMIN') {
    throw new AppError(403, "Only Super Admins can configure roles and investor profiles.");
  }

  const targetUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!targetUser) throw new AppError(404, "User not found");

  // Track the previous status so we don't spam emails if the status didn't actually change
  const wasAlreadyApproved = targetUser.isApproved;

  const result = await prisma.$transaction(async (tx) => {
    // 1. Update the base User role & approval
    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: {
        role: role as Role,
        isApproved: Boolean(isApproved),
      },
      select: { id: true, name: true, email: true, role: true, isApproved: true },
    });

    // 2. If they are marked as an INVESTOR, explicitly manage their dedicated profile
    if (role === 'INVESTOR') {
      // Only change the money fields that were actually sent. The role screen sends just the
      // profit %, and treating the missing ones as 0 used to wipe an investor's capital/balance.
      const num = (v: unknown) =>
        v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? undefined : Number(v);
      const percentage = num(investorProfitPercentage);
      const capital = num(totalInvested);
      const balance = num(currentBalance);

      await tx.investor.upsert({
        where: { userId },
        update: {
          ...(percentage !== undefined && { profitSharePercentage: percentage }),
          ...(capital !== undefined && { totalInvested: capital }),
          ...(balance !== undefined && { currentBalance: balance }),
        },
        create: {
          userId,
          profitSharePercentage: percentage ?? 0,
          totalInvested: capital ?? 0,
          currentBalance: balance ?? 0,
        },
      });
    }

    return updatedUser;
  });

  // 📧 3. Dispatch the Email Notification (Non-blocking)
  // We only send the email if the approval status actually changed during this update
  if (wasAlreadyApproved !== isApproved) {
    if (isApproved) {
      // Don't await these so the API responds instantly to the admin
      sendRoleApprovalEmail(result.email, result.name || "User", result.role);
    } else {
      sendRoleRejectionEmail(result.email, result.name || "User", result.role);
    }
  }

  return result;
};

const socialLogin = async (payload: { email: string; name: string }) => {
  let user = await prisma.user.findUnique({ where: { email: payload.email } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        name: payload.name,
        email: payload.email,
        isVerified: true,
      },
    });
  }

  const JwtPayload = {
    email: user.email,
    userId: user.id,
    role: user.role,
  };

  const accessToken = createToken(JwtPayload, config.access_token_secret!, config.access_token_expires!);
  const refreshToken = createToken(JwtPayload, config.refresh_token_secret!, config.refresh_token_expires!);

  return { user, accessToken, refreshToken };
};

const getMe = async (userId: string | undefined) => {
  if (!userId) {
    throw new AppError(400, 'User ID is required');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
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
    throw new AppError(404, 'User not found');
  }

  return user;
};

export const AuthServices = {
  register,
  verifyEmail,
  login,
  forgotPassword,
  resetPassword,
  changePassword,
  refreshToken,
  resendVerifyEmail,
  makeAdmin,
  makeSalesman,
  approveOrUpdateUserRole,
  socialLogin,
  getMe
};
