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
exports.uploadBase64ToCloudinary = exports.getPublicIdFromCloudinaryUrl = exports.deleteFromCloudinaryByPublicId = exports.deleteFromCloudinary = exports.uploadToCloudinary = exports.upload = void 0;
const multer_1 = __importDefault(require("multer"));
const cloudinary_1 = require("cloudinary");
// ✅ Multer memory storage for in-memory buffer
const storage = multer_1.default.memoryStorage();
exports.upload = (0, multer_1.default)({ storage });
// ✅ Configure Cloudinary
cloudinary_1.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});
// ✅ Reusable upload function
const uploadToCloudinary = (file_1, ...args_1) => __awaiter(void 0, [file_1, ...args_1], void 0, function* (file, folderPath = 'khushbuwaala_images/default', // e.g., categories, products, materials
publicIdPrefix = 'file', // e.g., category, product
convertToWebp = true) {
    try {
        if (!file.buffer)
            throw new Error('File buffer is missing');
        // Convert buffer to base64
        const base64String = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
        const result = yield cloudinary_1.v2.uploader.upload(base64String, {
            folder: folderPath,
            public_id: `${publicIdPrefix}-${Date.now()}`, // unique name
            format: convertToWebp ? 'webp' : undefined,
            resource_type: 'image',
        });
        return { location: result.secure_url };
    }
    catch (error) {
        throw new Error(`Cloudinary upload failed: ${error.message}`);
    }
});
exports.uploadToCloudinary = uploadToCloudinary;
// ✅ Reusable delete function
const deleteFromCloudinary = (fileUrl) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const parts = fileUrl.split('/');
        const folder = parts[parts.length - 2];
        const filename = parts[parts.length - 1].split('.')[0];
        const publicId = `${folder}/${filename}`;
        yield cloudinary_1.v2.uploader.destroy(publicId);
    }
    catch (error) {
        throw new Error(`Cloudinary delete failed: ${error.message}`);
    }
});
exports.deleteFromCloudinary = deleteFromCloudinary;
/**
 * ✅ IMPORTANT: delete using public_id (best)
 * If you only have URL, we can try to derive public_id, but it can break if structure changes.
 */
const deleteFromCloudinaryByPublicId = (publicId) => __awaiter(void 0, void 0, void 0, function* () {
    yield cloudinary_1.v2.uploader.destroy(publicId, { resource_type: "image" });
});
exports.deleteFromCloudinaryByPublicId = deleteFromCloudinaryByPublicId;
// fallback (URL-based, less reliable)
const getPublicIdFromCloudinaryUrl = (url) => {
    // https://res.cloudinary.com/<cloud>/image/upload/v12345/folder/name.webp
    const parts = url.split("/upload/");
    if (parts.length < 2)
        return null;
    const afterUpload = parts[1]; // v123/folder/name.webp OR folder/name.webp
    const noVersion = afterUpload.replace(/^v\d+\//, "");
    return noVersion.replace(/\.[a-z0-9]+$/i, ""); // remove extension
};
exports.getPublicIdFromCloudinaryUrl = getPublicIdFromCloudinaryUrl;
const uploadBase64ToCloudinary = (base64String_1, ...args_1) => __awaiter(void 0, [base64String_1, ...args_1], void 0, function* (base64String, folderPath = 'khushbuwaala_images/reviews', publicIdPrefix = 'review', convertToWebp = true) {
    var _a;
    try {
        // 1. Verify Cloudinary environment keys are loaded
        if (!process.env.CLOUDINARY_CLOUD_NAME ||
            !process.env.CLOUDINARY_API_KEY ||
            !process.env.CLOUDINARY_API_SECRET) {
            console.error("Cloudinary Configuration Error: Environment variables are missing!");
            throw new Error("Cloudinary credentials are not configured properly.");
        }
        // 2. Perform upload
        const uploadOptions = {
            folder: folderPath,
            public_id: `${publicIdPrefix}-${Date.now()}`,
            resource_type: 'image',
        };
        if (convertToWebp) {
            uploadOptions.transformation = [{ fetch_format: 'webp', quality: 'auto' }];
        }
        const result = yield cloudinary_1.v2.uploader.upload(base64String, uploadOptions);
        if (!(result === null || result === void 0 ? void 0 : result.secure_url)) {
            throw new Error("Cloudinary did not return a secure URL.");
        }
        return { location: result.secure_url };
    }
    catch (error) {
        // 3. Print the real error to console so it's never 'undefined'
        console.error("Detailed Cloudinary Upload Error:", error);
        const errorMessage = (error === null || error === void 0 ? void 0 : error.message) ||
            ((_a = error === null || error === void 0 ? void 0 : error.error) === null || _a === void 0 ? void 0 : _a.message) ||
            (typeof error === 'string' ? error : JSON.stringify(error)) ||
            "Unknown upload error";
        throw new Error(`Cloudinary upload failed: ${errorMessage}`);
    }
});
exports.uploadBase64ToCloudinary = uploadBase64ToCloudinary;
