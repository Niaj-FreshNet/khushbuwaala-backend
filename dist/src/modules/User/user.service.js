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
exports.UserServices = void 0;
const QueryBuilder_1 = require("../../builder/QueryBuilder");
const config_1 = __importDefault(require("../../config"));
const AppError_1 = __importDefault(require("../../errors/AppError"));
const client_1 = require("../../../prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
const http_status_1 = __importDefault(require("http-status"));
const emails_1 = require("../../helpers/emailSender/emails");
const getAllUsers = (id, queryParams) => __awaiter(void 0, void 0, void 0, function* () {
    const queryBuilder = new QueryBuilder_1.PrismaQueryBuilder(queryParams, ['name']);
    queryBuilder.buildWhere().buildSort().buildPagination().buildSelect();
    const prismaQuery = queryBuilder.getQuery();
    prismaQuery.where = {
        AND: [prismaQuery.where || {}, { NOT: { id } }],
    };
    if (!prismaQuery.select) {
        prismaQuery.select = {
            id: true,
            name: true,
            email: true,
            role: true,
            phone: true,
            imageUrl: true,
            address: true,
            district: true,
            createdAt: true,
        };
    }
    const result = yield client_1.prisma.user.findMany(prismaQuery);
    const meta = yield queryBuilder.getPaginationMeta(client_1.prisma.user);
    return {
        meta,
        data: result,
    };
});
const getUser = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield client_1.prisma.user.findUnique({
        where: { id },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            phone: true,
            imageUrl: true,
            address: true,
            district: true,
        },
    });
    return result;
});
const getUserByID = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield client_1.prisma.user.findUnique({
        where: { id },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            phone: true,
            imageUrl: true,
            address: true,
            district: true,
            createdAt: true,
        },
    });
    return result;
});
const changePassword = (id, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const { oldPassword, newPassword } = payload;
    if (!oldPassword || !newPassword) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Both current and new passwords are required');
    }
    // 1. Fetch user including their existing hashed password and email
    const user = yield client_1.prisma.user.findUnique({
        where: { id },
        select: {
            id: true,
            email: true,
            name: true,
            password: true,
        },
    });
    if (!user) {
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'User not found');
    }
    // Guard check: Ensure user actually has an existing password set
    if (!user.password) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'This account does not have a password set. Please use password reset or social login.');
    }
    // 2. Verify current password
    const isPasswordMatched = yield bcrypt_1.default.compare(oldPassword, user.password);
    if (!isPasswordMatched) {
        throw new AppError_1.default(http_status_1.default.UNAUTHORIZED, 'Current password is incorrect');
    }
    // 3. Prevent reusing the exact same password
    const isSamePassword = yield bcrypt_1.default.compare(newPassword, user.password);
    if (isSamePassword) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'New password cannot be the same as your current password');
    }
    // 4. Hash and save new password
    const hashedPassword = yield bcrypt_1.default.hash(newPassword, Number(config_1.default.salt_round));
    yield client_1.prisma.user.update({
        where: { id },
        data: {
            password: hashedPassword,
        },
    });
    // 5. Fire email alert asynchronously (non-blocking)
    if (user.email) {
        (0, emails_1.sendPasswordChangeNotificationEmail)(user.email, user.name).catch((err) => {
            console.error('Password change email error:', err);
        });
    }
    return true;
});
const updateUser = (id, data) => __awaiter(void 0, void 0, void 0, function* () {
    const updateData = {};
    if (data.name !== undefined)
        updateData.name = String(data.name).trim();
    if (data.address !== undefined)
        updateData.address = String(data.address).trim();
    if (data.district !== undefined)
        updateData.district = String(data.district).trim(); // ✅ Allow district
    if (data.imageUrl !== undefined)
        updateData.imageUrl = data.imageUrl;
    // ✅ Handle Email update & prevent duplicates
    if (data.email !== undefined) {
        const cleanEmail = String(data.email).trim().toLowerCase();
        const existing = yield client_1.prisma.user.findFirst({
            where: {
                email: cleanEmail,
                NOT: { id },
            },
        });
        if (existing) {
            throw new AppError_1.default(http_status_1.default.CONFLICT, 'Email is already in use by another account');
        }
        updateData.email = cleanEmail;
    }
    // Accept either phone or contact from payload and save to prisma's phone field
    const incomingPhone = data.phone !== undefined ? data.phone : data.contact;
    if (incomingPhone !== undefined) {
        updateData.phone = String(incomingPhone).trim();
    }
    const result = yield client_1.prisma.user.update({
        where: { id },
        data: updateData,
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            phone: true,
            imageUrl: true,
            address: true,
            district: true,
        },
    });
    return result;
});
exports.UserServices = {
    getUser,
    getUserByID,
    changePassword,
    updateUser,
    getAllUsers,
};
