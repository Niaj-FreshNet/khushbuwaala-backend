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
exports.deleteFromDigitalOceanAWS = exports.uploadToDigitalOceanAWS = exports.upload = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const multer_1 = __importDefault(require("multer"));
// import { nanoid } from 'nanoid';
const config_1 = __importDefault(require("../config"));
// Memory storage for serverless compatibility
const storage = multer_1.default.memoryStorage();
exports.upload = (0, multer_1.default)({
    storage,
});
// DigitalOcean S3 client setup
const s3Client = new client_s3_1.S3Client({
    region: 'us-east-1',
    endpoint: config_1.default.aws.do_space_endpoint,
    credentials: {
        accessKeyId: config_1.default.aws.do_space_access_key || '',
        secretAccessKey: config_1.default.aws.do_space_secret_key || '',
    },
});
// Upload function
const uploadToDigitalOceanAWS = (file) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { nanoid } = require('nanoid');
        const key = `${nanoid()}-${file.originalname}`;
        const command = new client_s3_1.PutObjectCommand({
            Bucket: config_1.default.aws.do_space_bucket,
            Key: key,
            Body: file.buffer,
            ACL: 'public-read',
            ContentType: file.mimetype,
        });
        yield s3Client.send(command);
        const location = `${config_1.default.aws.do_space_endpoint}/${config_1.default.aws.do_space_bucket}/${key}`;
        return { location };
    }
    catch (error) {
        throw new Error(`Upload failed: ${error.message}`);
    }
});
exports.uploadToDigitalOceanAWS = uploadToDigitalOceanAWS;
// Optional delete function
const deleteFromDigitalOceanAWS = (fileUrl) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const key = fileUrl.split(`/${config_1.default.aws.do_space_bucket}/`)[1];
        const command = new client_s3_1.DeleteObjectCommand({
            Bucket: config_1.default.aws.do_space_bucket,
            Key: key,
        });
        yield s3Client.send(command);
    }
    catch (error) {
        throw new Error(`Delete failed: ${error.message}`);
    }
});
exports.deleteFromDigitalOceanAWS = deleteFromDigitalOceanAWS;
