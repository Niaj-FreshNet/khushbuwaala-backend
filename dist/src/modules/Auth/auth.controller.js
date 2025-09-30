"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const AppError_1 = __importDefault(require("../../errors/AppError"));
const catchAsync_1 = __importDefault(require("../../utils/catchAsync"));
const sendResponse_1 = __importDefault(require("../../utils/sendResponse"));
const auth_service_1 = require("./auth.service");
const auth_validation_1 = require("./auth.validation");
const register = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield auth_service_1.AuthServices.register(req.body);
    const isok = result ? true : false;
    (0, sendResponse_1.default)(res, {
        statusCode: isok ? 201 : 400,
        success: isok,
        message: isok
            ? 'Registration Successfull please verify your email!'
            : 'Registration Failed',
        Data: isok ? result : [],
    });
}));
const verifyEmail = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { token, email } = req.body;
    const result = yield auth_service_1.AuthServices.verifyEmail(email, token);
    const isok = result ? true : false;
    (0, sendResponse_1.default)(res, {
        statusCode: isok ? 200 : 400,
        success: isok,
        message: isok
            ? 'Email Verification Successfull'
            : 'Email Verification Failed',
        Data: isok ? result : [],
    });
}));
const login = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email, password } = req.body;
    const result = yield auth_service_1.AuthServices.login({ email, password });
    const isok = result ? true : false;
    (0, sendResponse_1.default)(res, {
        statusCode: isok ? 200 : 400,
        success: isok,
        message: isok ? 'Login Successfull' : 'Login Failed',
        Data: isok ? result : [],
    });
}));
const forgotPassword = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email } = req.body;
    const result = yield auth_service_1.AuthServices.forgotPassword(email);
    const isok = result ? true : false;
    (0, sendResponse_1.default)(res, {
        statusCode: isok ? 200 : 400,
        success: isok,
        message: isok
            ? 'Password Reset Link Sent To Your Email Successfully!'
            : 'Password Reset Link Sent To Your Email Failed',
    });
}));
const resetPassword = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const token = req.params.token;
    const { email, newPassword } = req.body;
    const result = yield auth_service_1.AuthServices.resetPassword(email, token, newPassword);
    const isok = result ? true : false;
    (0, sendResponse_1.default)(res, {
        statusCode: isok ? 200 : 400,
        success: isok,
        message: isok ? 'Password Reset Successfull' : 'Password Reset Failed',
    });
}));
const changePassword = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email } = req.user;
    const { oldPassword, newPassword } = auth_validation_1.authValidation.changePasswordValidationSchema.parse(req.body);
    console.log(email, oldPassword, newPassword);
    const result = yield auth_service_1.AuthServices.changePassword(email, oldPassword, newPassword);
    const isok = result ? true : false;
    (0, sendResponse_1.default)(res, {
        statusCode: isok ? 200 : 400,
        success: isok,
        message: isok ? 'Password Changed Successfull' : 'Password Change Failed',
    });
}));
const refreshToken = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { refreshToken } = req.body;
    const result = yield auth_service_1.AuthServices.refreshToken(refreshToken);
    const isok = result ? true : false;
    (0, sendResponse_1.default)(res, {
        statusCode: isok ? 200 : 400,
        success: isok,
        message: isok
            ? 'Access Token Generated Successfully'
            : 'Access Token Generation Failed',
        Data: isok ? result : [],
    });
}));
const resendVerifyEmail = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email } = req.body;
    if (!email) {
        throw new AppError_1.default(400, 'Email is required');
    }
    const result = yield auth_service_1.AuthServices.resendVerifyEmail(email);
    const isok = result ? true : false;
    (0, sendResponse_1.default)(res, {
        statusCode: isok ? 200 : 400,
        success: isok,
        message: isok
            ? 'Verification Email Sent Successfully!'
            : 'Verification Email Sending Failed',
    });
}));
const makeAdmin = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { name, email, password } = req.body;
    if (!email || !name || !password) {
        throw new AppError_1.default(400, 'All fields is required! Please try again');
    }
    const result = yield auth_service_1.AuthServices.makeAdmin(req.body);
    const isok = result ? true : false;
    (0, sendResponse_1.default)(res, {
        statusCode: isok ? 200 : 400,
        success: isok,
        message: isok ? 'Admin Created Successfully!' : 'Admin Creation Failed',
        Data: isok ? result : [],
    });
}));
const makeSalesman = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { name, email, password } = req.body;
    if (!email || !name || !password) {
        throw new AppError_1.default(400, 'All fields is required! Please try again');
    }
    const result = yield auth_service_1.AuthServices.makeSalesman(req.body);
    const isok = result ? true : false;
    (0, sendResponse_1.default)(res, {
        statusCode: isok ? 200 : 400,
        success: isok,
        message: isok ? 'Admin Created Successfully!' : 'Admin Creation Failed',
        Data: isok ? result : [],
    });
}));
const socialLogin = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield auth_service_1.AuthServices.socialLogin(req.body);
    const isok = result ? true : false;
    (0, sendResponse_1.default)(res, {
        statusCode: isok ? 200 : 400,
        success: isok,
        message: isok ? 'Login Successfull' : 'Login Failed',
        Data: isok ? result : [],
    });
}));
exports.AuthController = {
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
