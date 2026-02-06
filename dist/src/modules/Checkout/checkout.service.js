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
exports.bkashGateway = void 0;
const axios_1 = __importDefault(require("axios"));
class BkashGatewayService {
    constructor() {
        this.token = { idToken: null, refreshToken: null, expiresAtMs: 0 };
        const baseURL = process.env.BKASH_BASE_URL;
        if (!baseURL)
            throw new Error("BKASH_BASE_URL missing");
        this.http = axios_1.default.create({
            baseURL,
            timeout: 30000, // bKash recommends default 30s timeout :contentReference[oaicite:9]{index=9}
        });
    }
    credsHeaders() {
        return {
            "Content-Type": "application/json",
            Accept: "application/json",
            username: process.env.BKASH_USERNAME,
            password: process.env.BKASH_PASSWORD,
        };
    }
    grantToken() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d;
            const { data } = yield this.http.post("/tokenized/checkout/token/grant", {
                app_key: process.env.BKASH_API_KEY,
                app_secret: process.env.BKASH_SECRET_KEY,
            }, { headers: this.credsHeaders() });
            // docs: expires_in default 3600s :contentReference[oaicite:10]{index=10}
            const expiresInSec = Number((_a = data.expires_in) !== null && _a !== void 0 ? _a : 3600);
            this.token.idToken = data.id_token;
            this.token.refreshToken = (_d = (_c = (_b = data.refresh_token) === null || _b === void 0 ? void 0 : _b.toString) === null || _c === void 0 ? void 0 : _c.call(_b)) !== null && _d !== void 0 ? _d : null;
            this.token.expiresAtMs = Date.now() + expiresInSec * 1000;
            return this.token.idToken;
        });
    }
    refreshToken() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d;
            const { data } = yield this.http.post("/tokenized/checkout/token/refresh", {
                app_key: process.env.BKASH_API_KEY,
                app_secret: process.env.BKASH_SECRET_KEY,
                refresh_token: this.token.refreshToken,
            }, { headers: this.credsHeaders() });
            const expiresInSec = Number((_a = data.expires_in) !== null && _a !== void 0 ? _a : 3600);
            this.token.idToken = data.id_token;
            this.token.refreshToken = (_d = (_c = (_b = data.refresh_token) === null || _b === void 0 ? void 0 : _b.toString) === null || _c === void 0 ? void 0 : _c.call(_b)) !== null && _d !== void 0 ? _d : this.token.refreshToken;
            this.token.expiresAtMs = Date.now() + expiresInSec * 1000;
            return this.token.idToken;
        });
    }
    getIdToken() {
        return __awaiter(this, void 0, void 0, function* () {
            // 60s safety
            if (this.token.idToken && Date.now() < this.token.expiresAtMs - 60000) {
                return this.token.idToken;
            }
            if (this.token.refreshToken) {
                try {
                    return yield this.refreshToken(); // refresh endpoint :contentReference[oaicite:11]{index=11}
                }
                catch (_a) {
                    return yield this.grantToken(); // grant endpoint :contentReference[oaicite:12]{index=12}
                }
            }
            return yield this.grantToken();
        });
    }
    authHeaders() {
        return __awaiter(this, void 0, void 0, function* () {
            const idToken = yield this.getIdToken();
            return {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: idToken, // id_token used as Authorization :contentReference[oaicite:13]{index=13}
                "X-App-Key": process.env.BKASH_API_KEY,
            };
        });
    }
    createPayment(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data } = yield this.http.post("/tokenized/checkout/create", {
                mode: "0011", // URL checkout requires 0011 :contentReference[oaicite:14]{index=14}
                payerReference: payload.payerReference,
                callbackURL: payload.callbackURL, // base URL :contentReference[oaicite:15]{index=15}
                amount: payload.amount.toFixed(2),
                currency: "BDT",
                intent: "sale", // required :contentReference[oaicite:16]{index=16}
                merchantInvoiceNumber: payload.invoice,
            }, { headers: yield this.authHeaders() });
            return data;
        });
    }
    executePayment(paymentID) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data } = yield this.http.post("/tokenized/checkout/execute", { paymentID }, // required :contentReference[oaicite:17]{index=17}
            { headers: yield this.authHeaders() });
            return data;
        });
    }
    queryPayment(paymentID) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data } = yield this.http.post("/tokenized/checkout/payment/status", { paymentID }, { headers: yield this.authHeaders() });
            return data;
        });
    }
    refundTransaction(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data } = yield this.http.post("/v2/tokenized-checkout/refund/payment/transaction", // refund URL :contentReference[oaicite:18]{index=18}
            {
                paymentId: payload.paymentId,
                trxId: payload.trxId,
                refundAmount: payload.refundAmount.toFixed(2),
                sku: payload.sku,
                reason: payload.reason,
            }, { headers: yield this.authHeaders() });
            return data;
        });
    }
}
exports.bkashGateway = new BkashGatewayService();
