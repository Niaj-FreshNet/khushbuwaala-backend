"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const routes_1 = __importDefault(require("./routes/routes"));
const globalErrorHandler_1 = __importDefault(require("./middlewares/globalErrorHandler"));
const NotFound_1 = __importDefault(require("./middlewares/NotFound"));
const path_1 = __importDefault(require("path"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const app = (0, express_1.default)();
const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5000',
    'http://localhost:5173',
    'http://localhost:5174',
    'https://khushbuwaala.vercel.app',
    'https://khushbuwaala.com',
    'https://www.khushbuwaala.com',
    'http://khushbuwaala.com',
    'http://www.khushbuwaala.com',
    'http://sgtm.khushbuwaala.com',
    'https://sgtm.khushbuwaala.com',
];
// 1️⃣ Dedicated CORS & Preflight Interceptor (MUST BE FIRST)
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (allowedOrigins.includes(origin) || origin.includes('localhost'))) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    else {
        res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-auth-token');
    res.setHeader('Access-Control-Max-Age', '86400'); // Cache preflight for 24h
    // 👉 Intercept OPTIONS preflight immediately and exit with 204 No Content
    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }
    next();
});
// 2️⃣ Body Parsers & Cookies
app.use(express_1.default.json());
app.use((0, cookie_parser_1.default)());
app.use(express_1.default.urlencoded({ extended: true }));
app.use(express_1.default.static('public'));
// 3️⃣ Routes
app.use('/api', routes_1.default);
app.use('/uploads', express_1.default.static(path_1.default.join(process.cwd(), 'uploads')));
// 4️⃣ Health Check
app.get('/', (req, res) => {
    res.send('Welcome to Khushbuwaala Server');
});
// 5️⃣ Error Handlers (Always last)
app.use(globalErrorHandler_1.default);
app.use(NotFound_1.default);
exports.default = app;
