import dotenv from 'dotenv';
dotenv.config();

// Names here match the real .env keys (checked against the server .env, 2026-11-22).
// Some modules still read process.env directly (Cloudinary, Gmail, DGePay, Steadfast, Meta);
// those keys are listed in env.example.
export default {
  port: process.env.PORT,
  salt_round: process.env.SALT_ROUND,
  stripe_api_secret: process.env.STRIPE_SECRET_KEY,
  client_url: process.env.CLIENT_URL,
  brevo: {
    api_key: process.env.BREVO_API_KEY || '',
  },
  // Prisma reads DATABASE_URL itself (prisma/schema.prisma).
  db_url: process.env.DATABASE_URL,
  node_env: process.env.NODE_ENV || 'development',
  access_token_secret: process.env.JWT_ACCESS_TOKEN,
  access_token_expires: process.env.JWT_TOKEN_EXPIRES,
  refresh_token_secret: process.env.JWT_REFRESH_TOKEN,
  refresh_token_expires: process.env.JWT_REFRESH_TOKEN_EXPIRES,
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  cloud_api_key: process.env.CLOUDINARY_API_KEY,
  cloud_api_secret: process.env.CLOUDINARY_API_SECRET,
  email: {
    gmail_user: process.env.GMAIL_USER,
    gmail_app_password: process.env.GMAIL_APP_PASSWORD,
  },
  // .env uses FRONTEND_LIVE_URL; the old name never matched, so reset links pointed at localhost.
  live_url: process.env.FRONTEND_LIVE_URL || process.env.Frontend_Live_URL || process.env.CLIENT_URL,
};
