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
exports.OrderController = void 0;
const catchAsync_1 = __importDefault(require("../../utils/catchAsync"));
const sendResponse_1 = __importDefault(require("../../utils/sendResponse"));
const order_service_1 = require("./order.service");
const getAllOrders = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield order_service_1.OrderServices.getAllOrders(req.query);
    const isok = result ? true : false;
    res.status(isok ? 200 : 400).json({
        statusCode: isok ? 200 : 400,
        success: isok ? true : false,
        message: isok ? 'Orders Fetched Successfully' : 'Orders Fetching Failed',
        Data: isok ? result : [],
    });
}));
const getOrderById = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield order_service_1.OrderServices.getOrderById(req.params.id);
    const isok = result ? true : false;
    res.status(isok ? 200 : 400).json({
        statusCode: isok ? 200 : 400,
        success: isok ? true : false,
        message: isok ? 'Order Fetched Successfully' : 'Order Fetching Failed',
        Data: isok ? result : [],
    });
}));
const getUserOrders = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield order_service_1.OrderServices.getUserOrders(req.params.id, req.query);
    const isok = result ? true : false;
    res.status(isok ? 200 : 400).json({
        statusCode: isok ? 200 : 400,
        success: isok ? true : false,
        message: isok ? 'Orders Fetched Successfully' : 'Orders Fetching Failed',
        Data: isok ? result : [],
    });
}));
const updateOrderStatus = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield order_service_1.OrderServices.updateOrderStatus(req.params.id, req.body);
    const isok = result ? true : false;
    res.status(isok ? 200 : 400).json({
        statusCode: isok ? 200 : 400,
        success: isok ? true : false,
        message: isok
            ? 'Order Status Updated Successfully'
            : 'Order Status Updating Failed',
        Data: isok ? result : [],
    });
}));
const getMyOrders = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = req.user.id;
    const result = yield order_service_1.OrderServices.getMyOrders(userId, req.query);
    const isok = result ? true : false;
    (0, sendResponse_1.default)(res, {
        statusCode: isok ? 200 : 400,
        success: isok ? true : false,
        message: isok ? 'Orders fatched successfully!' : 'Orders Fatching Failed',
        Data: isok ? result : [],
    });
}));
const getMyOrderByID = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = req.user.id;
    console.log('req.params.id', req.params.id);
    const result = yield order_service_1.OrderServices.getMyOrder(userId, req.params.id);
    const isok = result ? true : false;
    (0, sendResponse_1.default)(res, {
        statusCode: isok ? 200 : 400,
        success: isok ? true : false,
        message: isok ? 'Order Fetched Successfully' : 'Order Fetching Failed',
        Data: isok ? result : [],
    });
}));
const getAllCustomers = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield order_service_1.OrderServices.getAllCustomers(req.query);
    const isok = result ? true : false;
    res.status(isok ? 200 : 400).json({
        statusCode: isok ? 200 : 400,
        success: isok ? true : false,
        message: isok
            ? 'Customers Fetched Successfully'
            : 'Customers Fetching Failed',
        Data: isok ? result : [],
    });
}));
exports.OrderController = {
    getAllOrders,
    getOrderById,
    getUserOrders,
    updateOrderStatus,
    getMyOrders,
    getMyOrderByID,
    getAllCustomers,
};
