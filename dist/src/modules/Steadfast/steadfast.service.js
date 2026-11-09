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
exports.getSteadfastBalance = exports.getSteadfastStatusByInvoice = exports.createSteadfastOrder = void 0;
const axios_1 = __importDefault(require("axios"));
const AppError_1 = __importDefault(require("../../errors/AppError"));
const http_status_1 = __importDefault(require("http-status"));
const BASE_URL = 'https://portal.packzy.com/api/v1';
const getHeaders = () => ({
    'Api-Key': process.env.STEADFAST_API_KEY,
    'Secret-Key': process.env.STEADFAST_SECRET_KEY,
    'Content-Type': 'application/json',
});
const createSteadfastOrder = (orderData) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const response = yield axios_1.default.post(`${BASE_URL}/create_order`, orderData, {
            headers: getHeaders(),
        });
        return response.data;
    }
    catch (error) {
        throw new AppError_1.default(((_a = error.response) === null || _a === void 0 ? void 0 : _a.status) || http_status_1.default.INTERNAL_SERVER_ERROR, ((_c = (_b = error.response) === null || _b === void 0 ? void 0 : _b.data) === null || _c === void 0 ? void 0 : _c.message) || 'Failed to create Steadfast order');
    }
});
exports.createSteadfastOrder = createSteadfastOrder;
const getSteadfastStatusByInvoice = (invoiceId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const response = yield axios_1.default.get(`${BASE_URL}/status_by_invoice/${invoiceId}`, {
            headers: getHeaders(),
        });
        return response.data;
    }
    catch (error) {
        throw new AppError_1.default(((_a = error.response) === null || _a === void 0 ? void 0 : _a.status) || http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to fetch Steadfast status by invoice');
    }
});
exports.getSteadfastStatusByInvoice = getSteadfastStatusByInvoice;
const getSteadfastBalance = () => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const response = yield axios_1.default.get(`${BASE_URL}/get_balance`, {
            headers: getHeaders(),
        });
        return response.data;
    }
    catch (error) {
        throw new AppError_1.default(((_a = error.response) === null || _a === void 0 ? void 0 : _a.status) || http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to fetch Steadfast balance');
    }
});
exports.getSteadfastBalance = getSteadfastBalance;
