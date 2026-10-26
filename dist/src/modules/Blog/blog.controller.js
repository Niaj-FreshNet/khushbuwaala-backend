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
exports.BlogController = void 0;
const AppError_1 = __importDefault(require("../../errors/AppError"));
const fileDelete_1 = require("../../helpers/fileDelete");
const client_1 = require("../../../prisma/client");
const catchAsync_1 = __importDefault(require("../../utils/catchAsync"));
const sendResponse_1 = __importDefault(require("../../utils/sendResponse"));
const blog_service_1 = require("./blog.service");
const createBlog = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const user = req.user;
    let imageUrl = '';
    if (!((_a = req.file) === null || _a === void 0 ? void 0 : _a.filename)) {
        throw new AppError_1.default(400, 'Image is required for blog creation');
    }
    imageUrl = `${process.env.BACKEND_LIVE_URL}/Uploads/${req.file.filename}`;
    const isPublish = req.body.isPublish === 'true' || req.body.isPublish === true;
    const blogdata = Object.assign(Object.assign({}, req.body), { userId: user.id, imageUrl,
        isPublish, metaTitle: req.body.metaTitle || req.body.title, metaDescription: req.body.metaDescription || '', keywords: req.body.keywords || '' });
    const result = yield blog_service_1.BlogServices.createBlog(blogdata);
    (0, sendResponse_1.default)(res, {
        statusCode: 201,
        success: true,
        message: 'Blog Created Successfully',
        data: result,
    });
}));
const updateBlog = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const blogId = req.params.id;
    const existingBlog = yield client_1.prisma.blog.findUnique({
        where: { id: blogId },
    });
    if (!existingBlog) {
        throw new AppError_1.default(404, 'Blog not found');
    }
    const updateddata = Object.assign({}, req.body);
    if (req.body.isPublish !== undefined) {
        updateddata.isPublish =
            req.body.isPublish === 'true' || req.body.isPublish === true;
    }
    if ((_a = req.file) === null || _a === void 0 ? void 0 : _a.filename) {
        if (existingBlog.imageUrl) {
            yield (0, fileDelete_1.deleteFile)(existingBlog.imageUrl);
        }
        updateddata.imageUrl = `${process.env.BACKEND_LIVE_URL}/Uploads/${req.file.filename}`;
    }
    const result = yield blog_service_1.BlogServices.updateBlog(blogId, updateddata);
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: 'Blog Updated Successfully',
        data: result,
    });
}));
const getAllBlogs = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield blog_service_1.BlogServices.getAllBlogs(req.query);
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: 'Blogs Fetched Successfully',
        data: result,
    });
}));
const getAllBlogsAdmin = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield blog_service_1.BlogServices.getAllBlogsAdmin(req.query);
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: 'Admin Blogs Fetched Successfully',
        data: result,
    });
}));
const getBlog = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { slug } = req.params; // FIXED: reading 'slug' rather than nonexistent 'id'
    const result = yield blog_service_1.BlogServices.getBlog(slug);
    if (!result) {
        throw new AppError_1.default(404, 'Blog not found');
    }
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: 'Blog Fetched Successfully',
        data: result,
    });
}));
const deleteBlog = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield blog_service_1.BlogServices.deleteBlog(req.params.id);
    (0, sendResponse_1.default)(res, {
        statusCode: 200,
        success: true,
        message: 'Blog Deleted Successfully',
        data: result,
    });
}));
exports.BlogController = {
    createBlog,
    getAllBlogs,
    getAllBlogsAdmin,
    getBlog,
    updateBlog,
    deleteBlog,
};
