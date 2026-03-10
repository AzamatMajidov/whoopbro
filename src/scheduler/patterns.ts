import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { Telegraf } from 'telegraf';
import { detectAndNotify } from '../services/patterns';

export function registerPatternCron(bot: Telegraf, db: PrismaClient): void {
  cron.schedule('0 5 * * *', async () => {
    const users = await db.user.findMany({
      where: { whoopConnected: true },
      select: {
        id: true,
        language: true,
      },
    });

    for (const user of users) {
      try {
        await detectAndNotify(user.id, db, bot, user.language);
        console.log(`[patterns] success for user ${user.id}`);
      } catch (err) {
        console.error(`[patterns] failed for user ${user.id}:`, err);
      }
    }
  }, { timezone: 'UTC' });

  console.log('[patterns] cron registered (daily 05:00 UTC)');
}
