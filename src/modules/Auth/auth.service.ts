import config from '../../config';

import { prisma } from '../../../prisma/client';
import { ILoginUser, IUser } from './auth.interface';
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
  // check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: {
      email: payload.email,
    },
  });

  if (existingUser) {
    throw new AppError(400, 'User already exists with this email');
  }

  if (!payload.password) {
    throw new AppError(400, 'Password is required');
  }

  // Hash the password
  const password = await bcrypt.hash(
    payload.password,
    Number(config.salt_round),
  );

  // Update payload with hashed password
  payload.password = password;

  const verificationToken = Math.floor(
    100000 + Math.random() * 900000,
  ).toString();

  const verificationTokenExpiry = new Date(Date.now() + 15 * 60 * 1000);

  sendVerificationEmail(payload.email, verificationToken);

  // Create the user
  const result = await prisma.user.create({
    data: {
      ...payload,
      role: payload.role as Role,
      verificationToken,
      verificationTokenExpiry,
    },
  });
  // console.log('result', result);
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
    config.refressh_token_secret as string,
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
    config.refressh_token_secret as string,
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
    where: {
      email,
    },
  });

  if (!user) {
    throw new AppError(400, 'User not found with this email');
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  const tokenExpiry = new Date(Date.now() + 1000 * 60 * 15); //15 minutes

  const link = `${config.live_url}/reset-password?email=${email}&token=${resetToken}`;

  await sendPasswordResetEmail(email, link);

  await prisma.user.update({
    where: {
      email,
    },
    data: {
      resetToken,
      resetTokenExpiry: tokenExpiry,
    },
  });

  return true;
};

export const resetPassword = async (
  email: string,
  token: string,
  password: string,
) => {
  const user = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (!user) {
    throw new Error('User not found with this email');
  }

  if (user.resetToken !== token || !user.resetTokenExpiry) {
    throw new Error('Invalid reset token');
  }

  if (user?.resetTokenExpiry < new Date()) {
    throw new Error('Reset token has expired');
  }

  const hashedPassword = await bcrypt.hash(password, Number(config.salt_round));

  await prisma.user.update({
    where: {
      email,
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
    config.refressh_token_secret as string,
  );

  if (!decoded) {
    throw new AppError(401, 'Invalid or expired refresh token!');
  }
  console.log(decoded);

  const user = await prisma.user.findUnique({
    where: {
      id: decoded.userId,
    },
  });

  if (!user) {
    throw new AppError(400, 'User not found with this refresh token');
  }

  const JwtPayload = {
    id: user.id,
    email: user.email,
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

interface IMakeAdmin {
  name: string;
  password: string;
  email: string;
  state: string;
  phone: string;
}

const makeAdmin = async (payload: IMakeAdmin) => {
  const { name, email, password } = payload;
  const user = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (user) {
    throw new AppError(400, 'User already exists with this email');
  }

  const result = await prisma.user.create({
    data: {
      name,
      email,
      password: await bcrypt.hash(password, Number(config.salt_round)),
      isVerified: true,
      role: 'ADMIN',
    },
  });

  return result;
};

interface IMakeSalesman {
  name: string;
  password: string;
  email: string;
  state: string;
  phone: string;
  address?: string;
  imageUrl?: string;
}

const makeSalesman = async (payload: IMakeSalesman) => {
  const { name, email, password } = payload;
  const user = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (user) {
    throw new AppError(400, 'User already exists with this email');
  }

  const result = await prisma.user.create({
    data: {
      name,
      email,
      password: await bcrypt.hash(password, Number(config.salt_round)),
      isVerified: true,
      role: 'SALESMAN',
    },
  });

  return result;
};

const socialLogin = async (payload: { email: string; name: string }) => {
  const userExist = await prisma.user.findUnique({
    where: {
      email: payload.email,
    },
  });

  if (!userExist) {
    const result = await prisma.user.create({
      data: {
        name: payload.name,
        email: payload.email,
        isVerified: true,
      },
    });
  }

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
    throw new AppError(400, 'User not found with this email');
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
    config.refressh_token_secret as string,
    config.refresh_token_expires as string,
  );

  return {
    user,
    accessToken,
    refreshToken,
  };
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
};
