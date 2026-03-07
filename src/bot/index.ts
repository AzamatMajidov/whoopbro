import { Telegraf } from 'telegraf';
import { config } from '../config';
import { loggerMiddleware } from './middleware/logger';
import { userMiddleware } from './middleware/user';
import { languageMiddleware } from './middleware/language';
import { startHandler } from './handlers/start';

export function createBot(): Telegraf {
  const bot = new Telegraf(config.BOT_TOKEN);

  // Middleware chain: logger → user → language
  bot.use(loggerMiddleware);
  bot.use(userMiddleware);
  bot.use(languageMiddleware);

  // Commands
  bot.command('start', startHandler);

  // Placeholder commands
  bot.command('settings', (ctx) => ctx.reply('Tez kunda...'));
  bot.command('status', (ctx) => ctx.reply('Tez kunda...'));
  bot.command('disconnect', (ctx) => ctx.reply('Tez kunda...'));
  bot.command('uz', (ctx) => ctx.reply('Tez kunda...'));
  bot.command('ru', (ctx) => ctx.reply('Tez kunda...'));

  return bot;
}

export async function startBot(bot: Telegraf): Promise<void> {
  if (config.NODE_ENV === 'production') {
    // Webhook mode
    await bot.launch({
      webhook: {
        domain: config.WHOOP_REDIRECT_URI.replace('/whoop/callback', ''),
        path: '/bot',
      },
    });
    console.log('🤖 Bot started (webhook mode)');
  } else {
    // Polling mode for development
    await bot.launch();
    console.log('🤖 Bot started (polling mode)');
  }
}
