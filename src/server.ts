// The one shared client (prisma/client.ts). A second `new PrismaClient()` here opened a
// second connection pool that only this file used.
import { prisma } from '../prisma/client';
import app from './app';
import config from './config';
import { Server } from 'http';
import { startCourierSyncSchedule } from './modules/Steadfast/courierSync';

let server: Server;

async function main() {
  try {
    await prisma.$connect();
    console.log('✅ Database connected successfully');

    const port = config.port || 5000;

    server = app.listen(port, () => {
      console.log(`🚀 Server is running on ${port}`);
      startCourierSyncSchedule(); // Steadfast statuses + payouts every 30 min (production only)
    });
  } catch (error) {
    console.error('❌ Failed to connect to the database', error);
    process.exit(1);
  }
}

main();

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  console.error('☠️  Unhandled Rejection detected:', error);
  if (server) {
    server.close(() => {
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('☠️  Uncaught Exception detected:', error);
  process.exit(1);
});

// (Optional) Handle SIGTERM for graceful shutdown (production best practice)
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received. Shutting down gracefully');
  if (server) {
    server.close(() => {
      prisma.$disconnect();
      console.log('💾 Prisma client disconnected');
    });
  }
});
