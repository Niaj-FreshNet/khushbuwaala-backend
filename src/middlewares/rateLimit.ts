import { NextFunction, Request, Response } from 'express';

/**
 * Small in-memory rate limiter (the API runs as one process, so memory is shared).
 * Limits brute force on login / password reset, sign-up spam, coupon guessing and
 * order-tracking scraping. Client IP comes from nginx (app.set('trust proxy', 'loopback')).
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// Drop expired buckets every few minutes so memory stays small.
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}, 5 * 60 * 1000).unref();

const hit = (key: string, max: number, windowMs: number) => {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  b.count += 1;
  return { ok: b.count <= max, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
};

export const rateLimit = (opts: {
  name: string;
  max: number;
  windowMs: number;
  /** extra key part, e.g. the email being logged into */
  keyExtra?: (req: Request) => string | undefined;
  message?: string;
}) => (req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const checks = [`${opts.name}:ip:${ip}`];
  const extra = opts.keyExtra?.(req);
  if (extra) checks.push(`${opts.name}:x:${extra.toLowerCase()}`);

  for (const key of checks) {
    const r = hit(key, opts.max, opts.windowMs);
    if (!r.ok) {
      res.setHeader('Retry-After', String(r.retryAfter));
      res.status(429).json({
        success: false,
        message: opts.message || `Too many attempts. Please wait ${Math.ceil(r.retryAfter / 60)} minute(s) and try again.`,
      });
      return;
    }
  }
  next();
};

const MIN = 60 * 1000;
export const limits = {
  login: rateLimit({ name: 'login', max: 20, windowMs: 15 * MIN }),
  loginPerEmail: rateLimit({ name: 'login-email', max: 10, windowMs: 15 * MIN, keyExtra: (r) => r.body?.email }),
  passwordEmail: rateLimit({ name: 'pw-email', max: 5, windowMs: 60 * MIN }),
  register: rateLimit({ name: 'register', max: 10, windowMs: 60 * MIN }),
  tokenCheck: rateLimit({ name: 'token', max: 20, windowMs: 15 * MIN }),
  track: rateLimit({ name: 'track', max: 30, windowMs: 10 * MIN }),
  coupon: rateLimit({ name: 'coupon', max: 30, windowMs: 10 * MIN }),
  createOrder: rateLimit({ name: 'create-order', max: 30, windowMs: 10 * MIN }),
};
