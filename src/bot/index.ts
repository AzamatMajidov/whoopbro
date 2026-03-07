import { Telegraf } from 'telegraf';
import { config } from '../config';
import { loggerMiddleware } from './middleware/logger';
import { userMiddleware } from './middleware/user';
import { languageMiddleware } from './middleware/language';
import { startHandler } from './handlers/start';
import { handleTextMessage, handleCallbackQuery } from './handlers/messages';
import { registerPaymentCallbacks, handleAdminCommand } from './handlers/payment';
import { registerSettingsHandlers, isAwaitingBriefTime, handleBriefTimeInput } from './handlers/settings';
import { WhoopService } from '../services/whoop';

export function createBot(whoop: WhoopService): Telegraf {
  const bot = new Telegraf(config.BOT_TOKEN);

  // Middleware chain: logger → user → language
  bot.use(loggerMiddleware);
  bot.use(userMiddleware);
  bot.use(languageMiddleware);

  // Commands
  bot.command('start', startHandler);
  bot.command('admin', (ctx) => handleAdminCommand(ctx, bot, whoop));

  // Register settings & payment handlers (commands + callbacks)
  registerSettingsHandlers(bot);
  registerPaymentCallbacks(bot, whoop);

  // Callback queries (for messages.ts handlers — detail, ask, etc.)
  bot.on('callback_query', (ctx) => handleCallbackQuery(ctx as any, whoop));

  // Text messages (skip commands)
  bot.on('text', (ctx) => {
    if (ctx.message.text.startsWith('/')) return;
    // Check if user is setting brief time
    if (ctx.from && isAwaitingBriefTime(ctx.from.id)) {
      handleBriefTimeInput(ctx);
      return;
    }
    handleTextMessage(ctx as any, whoop);
  });

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
