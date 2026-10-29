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
exports.FragranceController = exports.getAllFragrances = void 0;
const catchAsync_1 = __importDefault(require("../../utils/catchAsync"));
const sendResponse_1 = __importDefault(require("../../utils/sendResponse"));
const fragrance_service_1 = require("./fragrance.service");
const createFragrance = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield fragrance_service_1.FragranceServices.createFragrance(req.body);
    const isok = result ? true : false;
    (0, sendResponse_1.default)(res, {
        statusCode: isok ? 200 : 400,
        success: isok ? true : false,
        message: isok
            ? 'Fragrance Created Successfully'
            : 'Fragrance Creation Failed',
        data: isok ? result : [],
    });
}));
exports.getAllFragrances = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield fragrance_service_1.FragranceServices.getAllFragrances(req.query);
    const isok = result ? true : false;
    (0, sendResponse_1.default)(res, {
        statusCode: isok ? 200 : 400,
        success: isok ? true : false,
        message: isok
            ? 'Fragrances Fetched Successfully'
            : 'Fragrances Fetching Failed',
        data: isok ? result : [],
    });
}));
const getFragrance = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield fragrance_service_1.FragranceServices.getFragrance(req.params.id);
    const isok = result ? true : false;
    (0, sendResponse_1.default)(res, {
        statusCode: isok ? 200 : 400,
        success: isok ? true : false,
        message: isok
            ? 'Fragrance Fetched Successfully'
            : 'Fragrance Fetching Failed',
        data: isok ? result : [],
    });
}));
const updateFragrance = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield fragrance_service_1.FragranceServices.updateFragrance(req.params.id, req.body);
    const isok = result ? true : false;
    (0, sendResponse_1.default)(res, {
        statusCode: isok ? 200 : 400,
        success: isok ? true : false,
        message: isok
            ? 'Fragrance Updated Successfully'
            : 'Fragrance Updation Failed',
        data: isok ? result : [],
    });
}));
const deleteFragrance = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield fragrance_service_1.FragranceServices.deleteFragrance(req.params.id);
    const isok = result ? true : false;
    (0, sendResponse_1.default)(res, {
        statusCode: isok ? 200 : 400,
        success: isok ? true : false,
        message: isok
            ? 'Fragrance Deleted Successfully'
            : 'Fragrance Deletion Failed',
        data: isok ? result : [],
    });
}));
exports.FragranceController = {
    createFragrance,
    getAllFragrances: exports.getAllFragrances,
    getFragrance,
    updateFragrance,
    deleteFragrance,
};
