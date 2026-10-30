import config from '../../config';

import { prisma } from '../../../prisma/client';
import { ILoginUser, IUser, IUserPayload } from './auth.interface';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { Role } from '@prisma/client';
import { createToken, verifyToken } from './auth.utils';
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from '../../helpers/emailSender/emails';
import AppError from '../../errors/AppError';

const register = async (payload: IUser) => {
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

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  let result;

  if (existingUser) {
    // If user already exists but has no password (created via guest checkout)
    if (existingUser.password && existingUser.isVerified) {
      throw new AppError(400, "User already exists with this email. Please log in.");
    }

    // Update the guest-created user with credentials & verification token
    result = await prisma.user.update({
      where: { email },
      data: {
        name: payload.name || existingUser.name,
        password: hashedPassword,
        verificationToken,
        verificationTokenExpiry,
        isVerified: false, // Force verification
      },
    });
  } else {
    // Brand new user creation
    result = await prisma.user.create({
      data: {
        ...payload,
        email,
        password: hashedPassword,
        role: (payload.role as Role) || Role.USER,
        verificationToken,
        verificationTokenExpiry,
        isVerified: false,
      },
    });
  }

  // Send verification email
  await sendVerificationEmail(email, verificationToken);

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
      imageUrl: true,
    },
  });

  if (!user) {
    throw new AppError(404, 'Invalid credentials');
  }

  if (!user.isVerified) {
    throw new AppError(401, 'User is not verified');
  }

  const isPasswordMatched: boolean = await bcrypt.compare(
    payload.password,
    user?.password!,
  );

  if (!isPasswordMatched) {
    throw new AppError(401, 'Invalid credentials');
  }

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

  //refresh token
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
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new AppError(400, 'User not found with this email');
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  const tokenExpiry = new Date(Date.now() + 1000 * 60 * 15); // 15 minutes

  // Fallback to localhost if config.live_url is missing or undefined
  const baseUrl = config.live_url || 'http://localhost:3000';

  // If your frontend file is at app/reset-password/[token]/page.tsx, structure it like this:
  const link = `${baseUrl}/reset-password/${resetToken}`;

  await sendPasswordResetEmail(email, link);

  await prisma.user.update({
    where: { email },
    data: {
      resetToken,
      resetTokenExpiry: tokenExpiry,
    },
  });

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
  socialLogin,
  getMe
};
