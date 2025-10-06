import AppError from '../../errors/AppError';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { AuthServices } from './auth.service';
import { authValidation } from './auth.validation';

const register = catchAsync(async (req, res) => {
  const result = await AuthServices.register(req.body);
  const isok = result ? true : false;
  sendResponse(res, {
    statusCode: isok ? 201 : 400,
    success: isok,
    message: isok
      ? 'Registration Successfull please verify your email!'
      : 'Registration Failed',
    data: isok ? result : [],
  });
});

const verifyEmail = catchAsync(async (req, res) => {
  const { token, email } = req.body;

  const result = await AuthServices.verifyEmail(email, token);

  const isok = result ? true : false;

  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok,
    message: isok
      ? 'Email Verification Successfull'
      : 'Email Verification Failed',
    data: isok ? result : [],
  });
});

const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const result = await AuthServices.login({ email, password });

  if (!result) {
    return sendResponse(res, {
      statusCode: 400,
      success: false,
      message: 'Login Failed',
      data: [],
    });
  }

  // set refresh token in httpOnly cookie
  res.cookie('refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Login Successful',
    data: {
      user: result.user,
      accessToken: result.accessToken,
    },
  });
});

const forgotPassword = catchAsync(async (req, res) => {
  const { email } = req.body;
  const result = await AuthServices.forgotPassword(email);
  const isok = result ? true : false;

  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok,
    message: isok
      ? 'Password Reset Link Sent To Your Email Successfully!'
      : 'Password Reset Link Sent To Your Email Failed',
  });
});

const resetPassword = catchAsync(async (req, res) => {
  const token = req.params.token;
  const { email, newPassword } = req.body;

  const result = await AuthServices.resetPassword(email, token, newPassword);
  const isok = result ? true : false;

  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok,
    message: isok ? 'Password Reset Successfull' : 'Password Reset Failed',
  });
});

const changePassword = catchAsync(async (req, res) => {
  const { email } = (req as any).user;

  const { oldPassword, newPassword } =
    authValidation.changePasswordValidationSchema.parse(req.body);

  // console.log(email, oldPassword, newPassword);

  const result = await AuthServices.changePassword(
    email,
    oldPassword,
    newPassword,
  );
  const isok = result ? true : false;
  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok,
    message: isok ? 'Password Changed Successfull' : 'Password Change Failed',
  });
});

const refreshToken = catchAsync(async (req, res) => {
  const token = req.cookies['refreshToken'];

  if (!token) {
    throw new AppError(401, 'Refresh token missing');
  }

  const result = await AuthServices.refreshToken(token);

  sendResponse(res, {
    statusCode: result ? 200 : 400,
    success: !!result,
    message: result
      ? 'Access Token Generated Successfully'
      : 'Access Token Generation Failed',
    data: result || [],
  });
});

const resendVerifyEmail = catchAsync(async (req, res) => {
  const { email } = req.body;
  if (!email) {
    throw new AppError(400, 'Email is required');
  }
  const result = await AuthServices.resendVerifyEmail(email);
  const isok = result ? true : false;
  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok,
    message: isok
      ? 'Verification Email Sent Successfully!'
      : 'Verification Email Sending Failed',
  });
});

const makeAdmin = catchAsync(async (req, res) => {
  const result = await AuthServices.makeAdmin(req.body);

  // set refresh token in httpOnly cookie
  res.cookie('refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Admin created/updated successfully!',
    data: {
      user: result.result,
      accessToken: result.accessToken,
    },
  });
});

const makeSalesman = catchAsync(async (req, res) => {
  const result = await AuthServices.makeSalesman(req.body);

  // set refresh token in httpOnly cookie
  res.cookie('refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Salesman created/updated successfully!',
    data: {
      user: result.result,
      accessToken: result.accessToken,
    },
  });
});

const socialLogin = catchAsync(async (req, res) => {
  const result = await AuthServices.socialLogin(req.body);

  // set refresh token in httpOnly cookie
  res.cookie('refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Login Successful',
    data: {
      user: result.user,
      accessToken: result.accessToken,
    },
  });
});

const getMe = catchAsync(async (req, res) => {
  // console.log('req.user:', req.user);
  // console.log('req.user?.id:', req.user?.id);

  const user = await AuthServices.getMe(req.user?.id);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'User retrieved successfully',
    data: user,
  });
});

const logout = catchAsync(async (req, res) => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Logged out successfully',
  });
});

export const AuthController = {
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
  getMe,
  logout
};
