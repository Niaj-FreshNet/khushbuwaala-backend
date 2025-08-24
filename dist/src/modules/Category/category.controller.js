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
exports.CategoryController = void 0;
const AppError_1 = __importDefault(require("../../errors/AppError"));
const fileDelete_1 = require("../../helpers/fileDelete");
const catchAsync_1 = __importDefault(require("../../utils/catchAsync"));
const sendResponse_1 = __importDefault(require("../../utils/sendResponse"));
const category_service_1 = require("./category.service");
const createCategory = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (!req.file) {
        throw new AppError_1.default(400, 'At least one image is required');
    }
    let imageUrl = '';
    if (req.file.filename) {
        imageUrl = `${process.env.BACKEND_LIVE_URL}/uploads/${req.file.filename}`;
    }
    if (req.body.published && typeof req.body.published === 'string') {
        req.body.published = req.body.published === 'true' ? true : false;
    }
    if (req.body.sizes && typeof req.body.sizes === 'string') {
        req.body.sizes = JSON.parse(req.body.sizes);
    }
    const categoryData = Object.assign(Object.assign({}, req.body), { imageUrl });
    const result = yield category_service_1.CategoryServices.createCategory(categoryData);
    const isok = result ? true : false;
    (0, sendResponse_1.default)(res, {
        statusCode: isok ? 200 : 400,
        success: isok ? true : false,
        message: isok
            ? 'Category Created Successfully'
            : 'Category Creation Failed',
        Data: isok ? result : [],
    });
}));
const getAllCategories = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield category_service_1.CategoryServices.getAllCategories(req.query);
    const isok = result ? true : false;
    (0, sendResponse_1.default)(res, {
        statusCode: isok ? 200 : 400,
        success: isok ? true : false,
        message: isok
            ? 'Categories Fetched Successfully'
            : 'Categories Fetching Failed',
        Data: isok ? result : [],
    });
}));
const getAllCategoriesAdmin = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield category_service_1.CategoryServices.getAllCategoriesAdmin(req.query);
    const isok = result ? true : false;
    (0, sendResponse_1.default)(res, {
        statusCode: isok ? 200 : 400,
        success: isok ? true : false,
        message: isok
            ? 'Categories Fetched Successfully'
            : 'Categories Fetching Failed',
        Data: isok ? result : [],
    });
}));
const getCategory = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield category_service_1.CategoryServices.getCategory(req.params.id);
    const isok = result ? true : false;
    (0, sendResponse_1.default)(res, {
        statusCode: isok ? 200 : 400,
        success: isok ? true : false,
        message: isok
            ? 'Category Fetched Successfully'
            : 'Category Fetching Failed',
        Data: isok ? result : [],
    });
}));
const updateCategory = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const category = yield category_service_1.CategoryServices.getCategory(req.params.id);
    if (!category) {
        throw new AppError_1.default(400, 'Category not found');
    }
    let updatedData = Object.assign({}, req.body);
    // Handle image update
    if ((_a = req.file) === null || _a === void 0 ? void 0 : _a.filename) {
        if (category.imageUrl) {
            yield (0, fileDelete_1.deleteFile)(category.imageUrl);
        }
        updatedData.imageUrl = `${process.env.BACKEND_LIVE_URL}/uploads/${req.file.filename}`;
    }
    const result = yield category_service_1.CategoryServices.updateCategory(req.params.id, updatedData);
    const isok = result ? true : false;
    (0, sendResponse_1.default)(res, {
        statusCode: isok ? 200 : 400,
        success: isok ? true : false,
        message: isok
            ? 'Category Updated Successfully'
            : 'Category Updation Failed',
        Data: isok ? result : [],
    });
}));
const deleteCategory = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield category_service_1.CategoryServices.deleteCategory(req.params.id);
    const isok = result ? true : false;
    (0, sendResponse_1.default)(res, {
        statusCode: isok ? 200 : 400,
        success: isok ? true : false,
        message: isok
            ? 'Category Deleted Successfully'
            : 'Category Deletion Failed',
        Data: isok ? result : [],
    });
}));
exports.CategoryController = {
    createCategory,
    getAllCategories,
    getAllCategoriesAdmin,
    getCategory,
    updateCategory,
    deleteCategory,
};
