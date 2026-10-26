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
exports.UserController = void 0;
const http_status_1 = __importDefault(require("http-status"));
const cloudinary_1 = require("cloudinary");
const AppError_1 = __importDefault(require("../../errors/AppError"));
const client_1 = require("../../../prisma/client");
const catchAsync_1 = __importDefault(require("../../utils/catchAsync"));
const user_service_1 = require("./user.service");
const sendImageToCloudinary_1 = require("../../utils/sendImageToCloudinary");
const sendResponse_1 = __importDefault(require("../../utils/sendResponse"));
const getAllUsers = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id; // Current user ID (omitted from listing)
    // Pass req.query into getAllUsers
    const result = yield user_service_1.UserServices.getAllUsers(userId, req.query);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Users Fetched Successfully',
        meta: result.meta,
        data: result.data,
    });
}));
const getUser = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield user_service_1.UserServices.getUser(req.user.id);
    const isok = !!result;
    res.status(isok ? 200 : 400).json({
        statusCode: isok ? 200 : 400,
        success: isok,
        message: isok ? 'User Fetched Successfully' : 'User Fetching Failed',
        data: isok ? result : null,
    });
}));
const getUserByID = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // ✅ CORRECT: Read the ID from the route path parameter (:id)
    const { id } = req.params;
    const result = yield user_service_1.UserServices.getUserByID(id);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'User Fetched Successfully',
        data: result,
    });
}));
const changePassword = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = req.user.id;
    yield user_service_1.UserServices.changePassword(userId, req.body);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Password changed successfully',
        data: null,
    });
}));
const updateUser = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = req.params.id;
    const user = yield client_1.prisma.user.findUnique({
        where: { id: userId },
    });
    if (!user)
        throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'User not found');
    // ✅ Destructure email and district alongside other fields
    const { name, email, phone, contact, address, district } = req.body;
    let imageUrl = user.imageUrl;
    // 1. If file uploaded via Multer Memory Storage
    if (req.file) {
        if (user.imageUrl && user.imageUrl.includes('cloudinary.com')) {
            yield (0, sendImageToCloudinary_1.deleteFromCloudinary)(user.imageUrl).catch(() => { });
        }
        const uploaded = yield (0, sendImageToCloudinary_1.uploadToCloudinary)(req.file, 'khushbuwaala_images/users', 'user-avatar');
        imageUrl = uploaded.location;
    }
    // 2. If Base64 string sent from Dropzone in req.body.imageUrl
    else if (req.body.imageUrl && typeof req.body.imageUrl === 'string' && req.body.imageUrl.startsWith('data:image')) {
        if (user.imageUrl && user.imageUrl.includes('cloudinary.com')) {
            yield (0, sendImageToCloudinary_1.deleteFromCloudinary)(user.imageUrl).catch(() => { });
        }
        const uploadRes = yield cloudinary_1.v2.uploader.upload(req.body.imageUrl, {
            folder: 'khushbuwaala_images/users',
            public_id: `user-avatar-${userId}-${Date.now()}`,
            resource_type: 'image',
            format: 'webp',
        });
        imageUrl = uploadRes.secure_url;
    }
    // 3. If explicit null/empty string was sent to remove avatar
    else if (req.body.imageUrl === null || req.body.imageUrl === '') {
        if (user.imageUrl && user.imageUrl.includes('cloudinary.com')) {
            yield (0, sendImageToCloudinary_1.deleteFromCloudinary)(user.imageUrl).catch(() => { });
        }
        imageUrl = null;
    }
    // ✅ Pass email, district, and all updated fields to UserServices
    const updatedData = {
        name,
        email,
        phone: phone || contact,
        contact: phone || contact,
        address,
        district,
        imageUrl,
        role: req.body.role,
    };
    const result = yield user_service_1.UserServices.updateUser(userId, updatedData);
    res.status(200).json({
        statusCode: 200,
        success: true,
        message: 'User Updated Successfully',
        data: result,
    });
}));
exports.UserController = {
    getAllUsers,
    getUser,
    getUserByID,
    changePassword,
    updateUser,
};
