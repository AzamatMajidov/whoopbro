import { config } from './config';
import { db } from './db/client';

async function main() {
  console.log('🐣 WhoopBro starting...');
  console.log(`📦 Environment: ${config.NODE_ENV}`);

  // Verify DB connection
  try {
    await db.$connect();
    console.log('✅ Database connected');
  } catch (err) {
    console.error('❌ Database connection failed:', err);
    process.exit(1);
  }

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('🛑 SIGTERM received — shutting down...');
    await db.$disconnect();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('🛑 SIGINT received — shutting down...');
    await db.$disconnect();
    process.exit(0);
  });

  // Global error handlers
  process.on('uncaughtException', (err) => {
    console.error('💥 Uncaught Exception:', err);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('💥 Unhandled Rejection:', reason);
  });

  console.log('✅ WhoopBro ready');
}

main().catch((err) => {
  console.error('Fatal error during startup:', err);
  process.exit(1);
});
