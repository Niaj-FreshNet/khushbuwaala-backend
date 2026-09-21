import express, { Request, Response, NextFunction } from 'express';
import router from './routes/routes';
import globalErrorHandler from './middlewares/globalErrorHandler';
import NotFound from './middlewares/NotFound';
import path from 'path';
import cookieParser from 'cookie-parser';

const app = express();

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
app.use((req: Request, res: Response, next: NextFunction): void => {
  const origin = req.headers.origin as string;

  if (origin && (allowedOrigins.includes(origin) || origin.includes('localhost'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
  }

  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-auth-token'
  );
  res.setHeader('Access-Control-Max-Age', '86400'); // Cache preflight for 24h

  // 👉 Intercept OPTIONS preflight immediately and exit with 204 No Content
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
});

// 2️⃣ Body Parsers & Cookies
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// 3️⃣ Routes
app.use('/api', router);
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// 4️⃣ Health Check
app.get('/', (req: Request, res: Response) => {
  res.send('Welcome to Khushbuwaala Server');
});

// 5️⃣ Error Handlers (Always last)
app.use(globalErrorHandler);
app.use(NotFound);

export default app;