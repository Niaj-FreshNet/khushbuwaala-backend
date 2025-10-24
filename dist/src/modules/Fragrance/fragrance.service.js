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
exports.FragranceServices = void 0;
const QueryBuilder_1 = require("../../builder/QueryBuilder");
const AppError_1 = __importDefault(require("../../errors/AppError"));
const client_1 = require("../../../prisma/client");
const createFragrance = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    const isFragranceExist = yield client_1.prisma.fragrance.findFirst({
        where: {
            fragranceName: payload.fragranceName,
        },
    });
    if (isFragranceExist) {
        throw new AppError_1.default(403, 'Fragrance already exists');
    }
    const result = yield client_1.prisma.fragrance.create({
        data: {
            fragranceName: payload.fragranceName,
            imageUrl: payload.imageUrl,
        },
    });
    return result;
});
const getAllFragrances = (queryParams) => __awaiter(void 0, void 0, void 0, function* () {
    const queryBuilder = new QueryBuilder_1.PrismaQueryBuilder(queryParams, ['fragranceName'])
        .buildWhere()
        .buildSort()
        .buildPagination()
        .buildSelect();
    const materials = yield client_1.prisma.fragrance.findMany(queryBuilder.getQuery());
    const meta = yield queryBuilder.getPaginationMeta(client_1.prisma.fragrance);
    return {
        data: materials,
        meta,
    };
});
const getFragrance = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield client_1.prisma.fragrance.findUnique({
        where: {
            id,
        },
    });
    return result;
});
const updateFragrance = (id, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const isFragranceExist = yield client_1.prisma.fragrance.findUnique({
        where: {
            id,
        },
    });
    if (!isFragranceExist) {
        throw new AppError_1.default(400, 'Fragrance not found');
    }
    const result = yield client_1.prisma.fragrance.update({
        where: {
            id,
        },
        data: {
            fragranceName: payload.fragranceName,
        },
    });
    return result;
});
const deleteFragrance = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const isFragranceExist = yield client_1.prisma.fragrance.findUnique({
        where: {
            id,
        },
    });
    if (!isFragranceExist) {
        throw new AppError_1.default(400, 'Fragrance not found');
    }
    const result = yield client_1.prisma.fragrance.delete({
        where: {
            id,
        },
    });
    return result;
});
exports.FragranceServices = {
    createFragrance,
    getAllFragrances,
    getFragrance,
    updateFragrance,
    deleteFragrance,
};
