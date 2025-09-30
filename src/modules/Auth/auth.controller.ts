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
  const isok = result ? true : false;

  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok,
    message: isok ? 'Login Successfull' : 'Login Failed',
    data: isok ? result : [],
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

  console.log(email, oldPassword, newPassword);

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
  const { refreshToken } = req.body;
  const result = await AuthServices.refreshToken(refreshToken);
  const isok = result ? true : false;
  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok,
    message: isok
      ? 'Access Token Generated Successfully'
      : 'Access Token Generation Failed',
    data: isok ? result : [],
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
  const { name, email, password } = req.body;
  if (!email || !name || !password) {
    throw new AppError(400, 'All fields is required! Please try again');
  }
  const result = await AuthServices.makeAdmin(req.body);
  const isok = result ? true : false;
  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok,
    message: isok ? 'Admin Created Successfully!' : 'Admin Creation Failed',

    data: isok ? result : [],
  });
});

const makeSalesman = catchAsync(async (req, res) => {
  const { name, email, password } = req.body;
  if (!email || !name || !password) {
    throw new AppError(400, 'All fields is required! Please try again');
  }
  const result = await AuthServices.makeSalesman(req.body);
  const isok = result ? true : false;
  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok,
    message: isok ? 'Admin Created Successfully!' : 'Admin Creation Failed',

    data: isok ? result : [],
  });
});

const socialLogin = catchAsync(async (req, res) => {
  const result = await AuthServices.socialLogin(req.body);
  const isok = result ? true : false;
  sendResponse(res, {
    statusCode: isok ? 200 : 400,
    success: isok,
    message: isok ? 'Login Successfull' : 'Login Failed',
    data: isok ? result : [],
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
};
