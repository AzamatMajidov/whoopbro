import cron from 'node-cron';
import { Telegraf } from 'telegraf';
import { db } from '../db/client';
import { t, type Lang } from '../i18n';

const TZ = 'Asia/Tashkent';

export function startMaintenanceCron(bot: Telegraf): void {
  cron.schedule('0 9 * * *', () => {
    sendTrialWarnings(bot).catch((err) => {
      console.error('[maintenance] trial warnings error:', err);
    });
    sendExpiryReminders(bot).catch((err) => {
      console.error('[maintenance] expiry reminders error:', err);
    });
  }, { timezone: TZ });

  console.log('[maintenance] cron registered (daily 09:00 Tashkent)');
}

async function sendTrialWarnings(bot: Telegraf): Promise<void> {
  const now = new Date();
  const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

  const users = await db.user.findMany({
    where: {
      whoopConnected: true,
      subscription: {
        status: 'trial',
        trialEnd: { gt: now, lte: twoDaysFromNow },
      },
    },
    include: { subscription: true },
  });

  for (const user of users) {
    if (!user.subscription) continue;
    const daysLeft = Math.ceil((user.subscription.trialEnd.getTime() - now.getTime()) / 86400000);
    const lang: Lang = user.language === 'ru' ? 'ru' : 'uz';

    const message = daysLeft <= 1
      ? t(lang, 'trial_warning_1day')
      : t(lang, 'trial_warning_2days');

    try {
      await bot.telegram.sendMessage(user.id.toString(), message, {
        reply_markup: {
          inline_keyboard: [[{ text: t(lang, 'btn_subscribe'), callback_data: 'subscribe' }]],
        },
      });
    } catch (err) {
      console.error(`[maintenance] trial warning failed for user ${user.id}:`, err);
    }
  }
}

async function sendExpiryReminders(bot: Telegraf): Promise<void> {
  const now = new Date();
  const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

  const users = await db.user.findMany({
    where: {
      subscription: {
        status: 'active',
        paidUntil: { gt: now, lte: twoDaysFromNow },
      },
    },
    include: { subscription: true },
  });

  for (const user of users) {
    const lang: Lang = user.language === 'ru' ? 'ru' : 'uz';

    try {
      await bot.telegram.sendMessage(
        user.id.toString(),
        t(lang, 'expiry_warning'),
        {
          reply_markup: {
            inline_keyboard: [[{ text: t(lang, 'btn_extend_sub'), callback_data: 'subscribe' }]],
          },
        },
      );
    } catch (err) {
      console.error(`[maintenance] expiry reminder failed for user ${user.id}:`, err);
    }
  }
}
