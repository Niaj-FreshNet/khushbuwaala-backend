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
exports.SaleController = void 0;
const catchAsync_1 = __importDefault(require("../../utils/catchAsync"));
const sendResponse_1 = __importDefault(require("../../utils/sendResponse"));
const sale_service_1 = require("./sale.service");
const addSale = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const payload = req.body;
    const user = req.user;
    const result = yield sale_service_1.SaleServices.addSale(payload, user.id);
    const isOk = !!result;
    res.status(isOk ? 200 : 400).json({
        statusCode: isOk ? 200 : 400,
        success: isOk,
        message: isOk ? 'Sale Added Successfully' : 'Sale Creation Failed',
        data: isOk ? result : null,
    });
}));
const getAllSales = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield sale_service_1.SaleServices.getAllSales(req.query);
    const isok = result ? true : false;
    res.status(isok ? 200 : 400).json({
        statusCode: isok ? 200 : 400,
        success: isok ? true : false,
        message: isok ? 'Sales Fetched Successfully' : 'Sales Fetching Failed',
        Data: isok ? result : [],
    });
}));
const getSaleById = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield sale_service_1.SaleServices.getSaleById(req.params.id);
    const isok = result ? true : false;
    res.status(isok ? 200 : 400).json({
        statusCode: isok ? 200 : 400,
        success: isok ? true : false,
        message: isok ? 'Sale Fetched Successfully' : 'Sale Fetching Failed',
        Data: isok ? result : [],
    });
}));
const getUserSales = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield sale_service_1.SaleServices.getUserSales(req.params.id, req.query);
    const isok = result ? true : false;
    res.status(isok ? 200 : 400).json({
        statusCode: isok ? 200 : 400,
        success: isok ? true : false,
        message: isok ? 'Sales Fetched Successfully' : 'Sales Fetching Failed',
        Data: isok ? result : [],
    });
}));
const updateSaleStatus = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield sale_service_1.SaleServices.updateSaleStatus(req.params.id, req.body);
    const isok = result ? true : false;
    res.status(isok ? 200 : 400).json({
        statusCode: isok ? 200 : 400,
        success: isok ? true : false,
        message: isok
            ? 'Sale Status Updated Successfully'
            : 'Sale Status Updating Failed',
        Data: isok ? result : [],
    });
}));
const getMySales = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = req.user.id;
    const result = yield sale_service_1.SaleServices.getMySales(userId, req.query);
    const isok = result ? true : false;
    (0, sendResponse_1.default)(res, {
        statusCode: isok ? 200 : 400,
        success: isok ? true : false,
        message: isok ? 'Sales fatched successfully!' : 'Sales Fatching Failed',
        Data: isok ? result : [],
    });
}));
const getMySaleByID = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = req.user.id;
    console.log('req.params.id', req.params.id);
    const result = yield sale_service_1.SaleServices.getMySaleById(userId, req.params.id);
    const isok = result ? true : false;
    (0, sendResponse_1.default)(res, {
        statusCode: isok ? 200 : 400,
        success: isok ? true : false,
        message: isok ? 'Sale Fetched Successfully' : 'Sale Fetching Failed',
        Data: isok ? result : [],
    });
}));
const getAllSalesman = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield sale_service_1.SaleServices.getAllSalesman(req.query);
    const isok = result ? true : false;
    res.status(isok ? 200 : 400).json({
        statusCode: isok ? 200 : 400,
        success: isok ? true : false,
        message: isok
            ? 'Salesmans Fetched Successfully'
            : 'Salesmans Fetching Failed',
        Data: isok ? result : [],
    });
}));
exports.SaleController = {
    addSale,
    getAllSales,
    getSaleById,
    getUserSales,
    updateSaleStatus,
    getMySales,
    getMySaleByID,
    getAllSalesman,
};
