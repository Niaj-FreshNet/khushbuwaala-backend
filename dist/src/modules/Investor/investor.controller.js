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
exports.InvestorController = void 0;
const http_status_1 = __importDefault(require("http-status"));
const catchAsync_1 = __importDefault(require("../../utils/catchAsync"));
const sendResponse_1 = __importDefault(require("../../utils/sendResponse"));
const investor_service_1 = require("./investor.service");
const getInvestorDashboard = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const { startDate, endDate } = req.query;
    const userId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.userId);
    const userRole = (_c = req.user) === null || _c === void 0 ? void 0 : _c.role;
    const result = yield investor_service_1.InvestorServices.getInvestorDashboardData(userId, userRole, {
        startDate: startDate,
        endDate: endDate,
    });
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Investor dashboard data retrieved successfully',
        data: result,
    });
}));
const requestWithdrawal = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const userId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.id) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.userId);
    const { amount, method, note } = req.body;
    const result = yield investor_service_1.InvestorServices.requestWithdrawal(userId, amount, method, note);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.CREATED,
        success: true,
        message: 'Withdrawal request submitted successfully',
        data: result,
    });
}));
const getAllInvestors = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield investor_service_1.InvestorServices.getAllInvestors();
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'All investors retrieved successfully',
        data: result,
    });
}));
const updateInvestorData = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const result = yield investor_service_1.InvestorServices.updateInvestorData(id, req.body);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Investor financial data updated successfully',
        data: result,
    });
}));
const getAllWithdrawals = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { status } = req.query;
    const result = yield investor_service_1.InvestorServices.getAllWithdrawals(status);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: 'Withdrawals retrieved successfully',
        data: result,
    });
}));
const updateWithdrawalStatus = (0, catchAsync_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const { status, reference } = req.body;
    const result = yield investor_service_1.InvestorServices.updateWithdrawalStatus(id, status, reference);
    (0, sendResponse_1.default)(res, {
        statusCode: http_status_1.default.OK,
        success: true,
        message: `Withdrawal successfully marked as ${status}`,
        data: result,
    });
}));
exports.InvestorController = {
    getInvestorDashboard,
    requestWithdrawal,
    getAllInvestors,
    updateInvestorData,
    getAllWithdrawals,
    updateWithdrawalStatus,
};
