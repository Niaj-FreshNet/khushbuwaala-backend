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
exports.AuthServices = exports.resetPassword = void 0;
const config_1 = __importDefault(require("../../config"));
const client_1 = require("../../../prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
const crypto_1 = __importDefault(require("crypto"));
const client_2 = require("@prisma/client");
const auth_utils_1 = require("./auth.utils");
const emails_1 = require("../../helpers/emailSender/emails");
const AppError_1 = __importDefault(require("../../errors/AppError"));
// Inside auth.service.ts
const register = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const email = ((_a = payload.email) !== null && _a !== void 0 ? _a : "").trim().toLowerCase();
    if (!email) {
        throw new AppError_1.default(400, "Email is required");
    }
    if (!payload.password) {
        throw new AppError_1.default(400, "Password is required");
    }
    const hashedPassword = yield bcrypt_1.default.hash(payload.password, Number(config_1.default.salt_round));
    const verificationToken = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationTokenExpiry = new Date(Date.now() + 15 * 60 * 1000);
    // Determine role requested. If ADMIN, SALESMAN, or INVESTOR, they require Super Admin approval.
    // Standard users (USER) are auto-approved, while admin/salesman/investor require approval.
    const requestedRole = payload.role || client_2.Role.USER;
    const requiresApproval = requestedRole !== client_2.Role.USER;
    // Check if user already exists
    const existingUser = yield client_1.prisma.user.findUnique({
        where: { email },
    });
    let result;
    if (existingUser) {
        if (existingUser.password && existingUser.isVerified) {
            throw new AppError_1.default(400, "User already exists with this email. Please log in.");
        }
        result = yield client_1.prisma.user.update({
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
    }
    else {
        result = yield client_1.prisma.user.create({
            data: Object.assign(Object.assign({}, payload), { email, password: hashedPassword, role: requestedRole, isApproved: !requiresApproval, // false until approved by Super Admin
                verificationToken,
                verificationTokenExpiry, isVerified: false }),
        });
    }
    try {
        yield (0, emails_1.sendVerificationEmail)(email, verificationToken);
    }
    catch (error) {
        console.error("Warning: Failed to send verification email to", email, error);
    }
    return result;
});
const verifyEmail = (email, token) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield client_1.prisma.user.findUnique({
        where: {
            email,
        },
    });
    if (!user) {
        throw new AppError_1.default(404, 'User not found');
    }
    if (user.verificationToken !== token || !user.verificationTokenExpiry) {
        throw new AppError_1.default(400, 'Invalid verification token');
    }
    if ((user === null || user === void 0 ? void 0 : user.verificationTokenExpiry) < new Date()) {
        throw new AppError_1.default(401, 'Verification token has expired');
    }
    const updatedUser = yield client_1.prisma.user.update({
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
        userId: user === null || user === void 0 ? void 0 : user.id,
        role: user.role,
    };
    //create toke and send to the client
    const accessToken = (0, auth_utils_1.createToken)(JwtPayload, config_1.default.access_token_secret, config_1.default.access_token_expires);
    const refreshToken = (0, auth_utils_1.createToken)(JwtPayload, config_1.default.refresh_token_secret, config_1.default.refresh_token_expires);
    return {
        message: 'User verified successfully',
        updatedUser,
        accessToken,
        refreshToken,
    };
});
const login = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield client_1.prisma.user.findUnique({
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
    if (!user) {
        throw new AppError_1.default(404, 'Invalid credentials');
    }
    if (!user.isVerified) {
        throw new AppError_1.default(401, 'Please verify your email address first.');
    }
    // ✅ Check if Super Admin approval is pending for Admin/Salesman/Investor roles
    if (user.role !== client_2.Role.USER && user.isApproved === false) {
        throw new AppError_1.default(403, 'Your Access Role Approval is Pending.');
    }
    const isPasswordMatched = yield bcrypt_1.default.compare(payload.password, user === null || user === void 0 ? void 0 : user.password);
    if (!isPasswordMatched) {
        throw new AppError_1.default(401, 'Invalid credentials');
    }
    const JwtPayload = {
        email: user.email,
        userId: user === null || user === void 0 ? void 0 : user.id,
        role: user.role,
    };
    const accessToken = (0, auth_utils_1.createToken)(JwtPayload, config_1.default.access_token_secret, config_1.default.access_token_expires);
    const refreshToken = (0, auth_utils_1.createToken)(JwtPayload, config_1.default.refresh_token_secret, config_1.default.refresh_token_expires);
    return {
        user,
        accessToken,
        refreshToken,
    };
});
const forgotPassword = (email) => __awaiter(void 0, void 0, void 0, function* () {
    if (!email) {
        throw new AppError_1.default(400, 'Email is required');
    }
    const user = yield client_1.prisma.user.findUnique({
        where: { email },
    });
    if (!user) {
        throw new AppError_1.default(400, 'User not found with this email');
    }
    const resetToken = crypto_1.default.randomBytes(32).toString('hex');
    const tokenExpiry = new Date(Date.now() + 1000 * 60 * 15); // 15 minutes
    // Fallback to localhost if config.live_url is missing or undefined
    const baseUrl = config_1.default.live_url || 'http://localhost:3000';
    // If your frontend file is at app/reset-password/[token]/page.tsx, structure it like this:
    const link = `${baseUrl}/reset-password/${resetToken}`;
    try {
        yield (0, emails_1.sendPasswordResetEmail)(email, link);
    }
    catch (error) {
        console.error("Warning: Failed to send verification email to", email, error);
        // We don't throw the error here, so the user registration still succeeds
    }
    yield client_1.prisma.user.update({
        where: { email },
        data: {
            resetToken,
            resetTokenExpiry: tokenExpiry,
        },
    });
    return true;
});
const resetPassword = (token, password) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield client_1.prisma.user.findFirst({
        where: {
            resetToken: token,
        },
    });
    if (!user) {
        throw new AppError_1.default(404, 'Invalid or expired reset token');
    }
    if (!user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
        throw new AppError_1.default(400, 'Reset token has expired');
    }
    const hashedPassword = yield bcrypt_1.default.hash(password, Number(config_1.default.salt_round));
    yield client_1.prisma.user.update({
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
});
exports.resetPassword = resetPassword;
const changePassword = (email, oldPassword, newPassword) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield client_1.prisma.user.findUnique({
        where: {
            email,
        },
    });
    if (!user) {
        throw new AppError_1.default(400, 'User not found with this email');
    }
    if (!user.password) {
        throw new AppError_1.default(400, 'Password is required');
    }
    const isPasswordMatched = yield bcrypt_1.default.compare(oldPassword, user === null || user === void 0 ? void 0 : user.password);
    if (!isPasswordMatched) {
        throw new AppError_1.default(400, 'Invalid credentials password not matched!');
    }
    const hashedPassword = yield bcrypt_1.default.hash(newPassword, Number(config_1.default.salt_round));
    yield client_1.prisma.user.update({
        where: {
            email,
        },
        data: {
            password: hashedPassword,
        },
    });
    return true;
});
const refreshToken = (refreshToken) => __awaiter(void 0, void 0, void 0, function* () {
    if (!refreshToken) {
        throw new AppError_1.default(401, 'Refresh token is required');
    }
    const decoded = (0, auth_utils_1.verifyToken)(refreshToken, config_1.default.refresh_token_secret);
    if (!decoded) {
        throw new AppError_1.default(401, 'Invalid or expired refresh token!');
    }
    // console.log(decoded);
    const user = yield client_1.prisma.user.findUnique({
        where: {
            id: decoded.userId,
        },
    });
    if (!user) {
        throw new AppError_1.default(400, 'User not found with this refresh token');
    }
    const JwtPayload = {
        email: user.email,
        userId: user.id,
        role: user.role,
    };
    //create toke and send to the client
    const accessToken = (0, auth_utils_1.createToken)(JwtPayload, config_1.default.access_token_secret, config_1.default.access_token_expires);
    return { accessToken };
});
const resendVerifyEmail = (email) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield client_1.prisma.user.findUnique({
        where: {
            email,
        },
    });
    if (!user) {
        throw new AppError_1.default(400, 'User not found with this email');
    }
    if (user.isVerified) {
        throw new AppError_1.default(400, 'User is already verified');
    }
    const verificationToken = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationTokenExpiry = new Date(Date.now() + 15 * 60 * 1000);
    yield client_1.prisma.user.update({
        where: { email },
        data: {
            verificationToken,
            verificationTokenExpiry,
        },
    });
    (0, emails_1.sendVerificationEmail)(user.email, verificationToken);
    return true;
});
const makeAdmin = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    const { name, email, password } = payload;
    let user = yield client_1.prisma.user.findUnique({ where: { email } });
    let result;
    if (user) {
        result = yield client_1.prisma.user.update({ where: { email }, data: { role: client_2.Role.ADMIN } });
    }
    else {
        result = yield client_1.prisma.user.create({
            data: {
                name,
                email,
                password: yield bcrypt_1.default.hash(password, Number(config_1.default.salt_round)),
                isVerified: true,
                role: client_2.Role.ADMIN,
            },
        });
    }
    const JwtPayload = { email: result.email, userId: result.id, role: result.role };
    const accessToken = (0, auth_utils_1.createToken)(JwtPayload, config_1.default.access_token_secret, config_1.default.access_token_expires);
    const refreshToken = (0, auth_utils_1.createToken)(JwtPayload, config_1.default.refresh_token_secret, config_1.default.refresh_token_expires);
    return { result, accessToken, refreshToken };
});
const makeSalesman = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    const { name, email, password } = payload;
    let user = yield client_1.prisma.user.findUnique({ where: { email } });
    let result;
    if (user) {
        result = yield client_1.prisma.user.update({ where: { email }, data: { role: client_2.Role.SALESMAN } });
    }
    else {
        result = yield client_1.prisma.user.create({
            data: {
                name,
                email,
                password: yield bcrypt_1.default.hash(password, Number(config_1.default.salt_round)),
                isVerified: true,
                role: client_2.Role.SALESMAN,
            },
        });
    }
    const JwtPayload = { email: result.email, userId: result.id, role: result.role };
    const accessToken = (0, auth_utils_1.createToken)(JwtPayload, config_1.default.access_token_secret, config_1.default.access_token_expires);
    const refreshToken = (0, auth_utils_1.createToken)(JwtPayload, config_1.default.refresh_token_secret, config_1.default.refresh_token_expires);
    return { result, accessToken, refreshToken };
});
const approveOrUpdateUserRole = (adminUserId, 
// 👇 Add totalInvested and currentBalance here so TypeScript knows they exist
payload) => __awaiter(void 0, void 0, void 0, function* () {
    if (!adminUserId) {
        throw new AppError_1.default(401, "Unauthorized: Admin ID is missing.");
    }
    const { userId, role, isApproved, investorProfitPercentage, totalInvested, currentBalance } = payload;
    const admin = yield client_1.prisma.user.findUnique({ where: { id: adminUserId } });
    if (!admin || admin.role !== 'SUPER_ADMIN') {
        throw new AppError_1.default(403, "Only Super Admins can configure roles and investor profiles.");
    }
    const targetUser = yield client_1.prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser)
        throw new AppError_1.default(404, "User not found");
    // 🛡️ Transaction guarantees both User and Investor tables update perfectly together
    const result = yield client_1.prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
        // 3. Update the base User role & approval
        const updatedUser = yield tx.user.update({
            where: { id: userId },
            data: {
                role: role,
                isApproved: Boolean(isApproved),
            },
            select: { id: true, name: true, email: true, role: true, isApproved: true },
        });
        // 4. If they are marked as an INVESTOR, explicitly manage their dedicated profile
        if (role === 'INVESTOR') {
            const percentage = Number(investorProfitPercentage) || 0;
            const capital = Number(totalInvested) || 0;
            const balance = Number(currentBalance) || 0;
            yield tx.investor.upsert({
                where: { userId },
                update: {
                    profitSharePercentage: percentage,
                    totalInvested: capital,
                    currentBalance: balance
                },
                create: {
                    userId,
                    profitSharePercentage: percentage,
                    totalInvested: capital,
                    currentBalance: balance
                },
            });
        }
        return updatedUser;
    }));
    return result;
});
const socialLogin = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    let user = yield client_1.prisma.user.findUnique({ where: { email: payload.email } });
    if (!user) {
        user = yield client_1.prisma.user.create({
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
    const accessToken = (0, auth_utils_1.createToken)(JwtPayload, config_1.default.access_token_secret, config_1.default.access_token_expires);
    const refreshToken = (0, auth_utils_1.createToken)(JwtPayload, config_1.default.refresh_token_secret, config_1.default.refresh_token_expires);
    return { user, accessToken, refreshToken };
});
const getMe = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    if (!userId) {
        throw new AppError_1.default(400, 'User ID is required');
    }
    const user = yield client_1.prisma.user.findUnique({
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
        throw new AppError_1.default(404, 'User not found');
    }
    return user;
});
exports.AuthServices = {
    register,
    verifyEmail,
    login,
    forgotPassword,
    resetPassword: exports.resetPassword,
    changePassword,
    refreshToken,
    resendVerifyEmail,
    makeAdmin,
    makeSalesman,
    approveOrUpdateUserRole,
    socialLogin,
    getMe
};
