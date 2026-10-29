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
exports.dgepayGateway = void 0;
const axios_1 = __importDefault(require("axios"));
const crypto_js_1 = __importDefault(require("crypto-js"));
class DgePayGatewayService {
    constructor() {
        this.token = { accessToken: null, expiresAtMs: 0 };
        const baseURL = process.env.DGEPAY_BASE_URL;
        if (!baseURL)
            throw new Error("DGEPAY_BASE_URL missing");
        this.http = axios_1.default.create({
            baseURL: baseURL.replace(/\/+$/, ""),
            timeout: 30000,
        });
    }
    // --- Authentication ---
    authenticate() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const clientId = process.env.DGEPAY_CLIENT_ID;
            const clientSecret = process.env.DGEPAY_CLIENT_SECRET;
            const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
            const response = yield this.http.post("/authenticate", {}, {
                headers: { Authorization: `Basic ${basicAuth}` },
            });
            const data = ((_a = response.data) === null || _a === void 0 ? void 0 : _a.data) || response.data;
            const token = data === null || data === void 0 ? void 0 : data.access_token;
            if (!token)
                throw new Error("Failed to retrieve DGePay access token");
            this.token.accessToken = token;
            this.token.expiresAtMs = Date.now() + 55 * 60 * 1000;
            return token;
        });
    }
    getAccessToken() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.token.accessToken && Date.now() < this.token.expiresAtMs) {
                return this.token.accessToken;
            }
            return yield this.authenticate();
        });
    }
    // --- Checksum & Crypto Algorithms ---
    normalizeAmount(value) {
        if (typeof value === "number") {
            if (Number.isInteger(value))
                return `${value}.0`;
            return value.toString();
        }
        return String(value);
    }
    createCheckSum(payload) {
        const checksumParts = [];
        const buildChecksumString = (obj) => {
            const sortedKeys = Object.keys(obj).sort();
            for (const key of sortedKeys) {
                const value = obj[key];
                checksumParts.push(key);
                if (value === null || value === undefined) {
                    checksumParts.push("null");
                }
                else if (typeof value === "object" && !Array.isArray(value)) {
                    buildChecksumString(value);
                }
                else {
                    let strVal = key === "amount" ? this.normalizeAmount(value) : String(value);
                    strVal = strVal.replace(/\s+/g, "").replace(/:/g, "");
                    checksumParts.push(strVal);
                }
            }
        };
        buildChecksumString(payload);
        return checksumParts.join("");
    }
    generateHMACSignature(apiKey, bodyText) {
        const hash = crypto_js_1.default.HmacSHA256(bodyText, apiKey);
        return crypto_js_1.default.enc.Base64.stringify(hash);
    }
    encryptPayload(rawJsonBody, secretKey) {
        const key16 = crypto_js_1.default.enc.Utf8.parse(secretKey.substring(0, 16));
        const encrypted = crypto_js_1.default.AES.encrypt(rawJsonBody, key16, {
            mode: crypto_js_1.default.mode.ECB,
            padding: crypto_js_1.default.pad.Pkcs7,
        });
        return encrypted.toString();
    }
    decryptPayload(encryptedBase64) {
        try {
            const secretKey = process.env.DGEPAY_SECRET_KEY;
            const key16 = crypto_js_1.default.enc.Utf8.parse(secretKey.substring(0, 16));
            // Clean leading/trailing quotes if Axios improperly parsed it as a string literal
            const cleanBase64 = encryptedBase64.replace(/^"|"$/g, "").trim();
            const decrypted = crypto_js_1.default.AES.decrypt(cleanBase64, key16, {
                mode: crypto_js_1.default.mode.ECB,
                padding: crypto_js_1.default.pad.Pkcs7,
            });
            const decryptedText = decrypted.toString(crypto_js_1.default.enc.Utf8);
            if (!decryptedText)
                return { _raw: encryptedBase64, _error: "Decryption resulted in empty string" };
            // Strip invisible control characters generated by PKCS7 padding parsing
            const cleanText = decryptedText.replace(/[\x00-\x1F\x7F-\x9F]/g, "");
            return JSON.parse(cleanText);
        }
        catch (error) {
            console.error("❌ DGePay Decryption Failed:", error.message);
            return { _raw_encrypted: encryptedBase64, _decryption_error: error.message };
        }
    }
    // --- API Calls ---
    initiatePayment(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const token = yield this.getAccessToken();
            const apiKey = process.env.DGEPAY_API_KEY;
            const secretKey = process.env.DGEPAY_SECRET_KEY;
            const payloadObj = {
                amount: payload.amount,
                customer_token: null,
                note: payload.note,
                payee_information: payload.payee_information,
                payment_method: null,
                redirect_url: payload.redirect_url,
                unique_txn_id: payload.unique_txn_id,
                meta_data: {
                    custom_field_1: ((_a = payload.meta_data) === null || _a === void 0 ? void 0 : _a.custom_field_1) || "",
                    custom_field_2: ((_b = payload.meta_data) === null || _b === void 0 ? void 0 : _b.custom_field_2) || "",
                    custom_field_3: ((_c = payload.meta_data) === null || _c === void 0 ? void 0 : _c.custom_field_3) || "",
                },
            };
            const rawJsonBody = JSON.stringify(payloadObj);
            const checksumString = this.createCheckSum(payloadObj);
            const signature = this.generateHMACSignature(apiKey, checksumString);
            const encryptedPayload = this.encryptPayload(rawJsonBody, secretKey);
            const { data } = yield this.http.post("/initiate_payment", encryptedPayload, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Signature: signature,
                    "Content-Type": "text/plain",
                },
                responseType: "text", // 👈 CRITICAL: Prevents Axios from messing up the raw text response
            });
            // console.log("📥 Raw DGePay Success Response:", data);
            let parsedData = data;
            if (typeof data === "string") {
                try {
                    parsedData = JSON.parse(data);
                }
                catch (_d) {
                    // Not a JSON string -> try decrypting
                    parsedData = this.decryptPayload(data);
                }
            }
            if ((parsedData === null || parsedData === void 0 ? void 0 : parsedData.data) && typeof parsedData.data === "string" && parsedData.data.length > 20) {
                try {
                    parsedData.data = this.decryptPayload(parsedData.data);
                }
                catch (err) {
                    // keep as is if not decryptable
                }
            }
            return parsedData;
        });
    }
    checkTransactionStatus(unique_txn_id) {
        return __awaiter(this, void 0, void 0, function* () {
            const token = yield this.getAccessToken();
            const apiKey = process.env.DGEPAY_API_KEY;
            const secretKey = process.env.DGEPAY_SECRET_KEY;
            const payloadObj = { unique_txn_id };
            const rawJsonBody = JSON.stringify(payloadObj);
            const checksumString = this.createCheckSum(payloadObj);
            const signature = this.generateHMACSignature(apiKey, checksumString);
            const encryptedPayload = this.encryptPayload(rawJsonBody, secretKey);
            const { data } = yield this.http.post("/check_transaction_status", encryptedPayload, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Signature: signature,
                    "Content-Type": "text/plain",
                },
                responseType: "text",
            });
            let parsedData = data;
            if (typeof data === "string" && data.length > 10) {
                parsedData = this.decryptPayload(data);
            }
            else if ((data === null || data === void 0 ? void 0 : data.data) && typeof data.data === "string") {
                parsedData = this.decryptPayload(data.data);
            }
            return parsedData;
        });
    }
}
exports.dgepayGateway = new DgePayGatewayService();
