import { config } from './config';
import { db } from './db/client';
import { createBot, startBot } from './bot';
import { startOAuthServer } from './oauth/server';
import { WhoopService } from './services/whoop';
import { startScheduler } from './scheduler';

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

  // Create whoop service first (needed by bot and scheduler)
  const whoop = new WhoopService(db);

  // Create and start bot
  const bot = createBot(whoop);

  // Start OAuth server (needs bot for sending Telegram messages)
  startOAuthServer(bot);
  startScheduler(bot, whoop);
  console.log('⏰ Scheduler started');

  // Start bot (polling blocks in dev — must be last)
  await startBot(bot);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('🛑 SIGTERM received — shutting down...');
    bot.stop('SIGTERM');
    await db.$disconnect();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('🛑 SIGINT received — shutting down...');
    bot.stop('SIGINT');
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
