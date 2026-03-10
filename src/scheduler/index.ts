import cron from 'node-cron';
import { Telegraf } from 'telegraf';
import { WhoopService } from '../services/whoop';
import { runStaleFallback } from './prefetch';
import { checkAndDeliverBriefs } from './deliver';
import { sendWeeklySummaries } from './weekly';
import { startMaintenanceCron } from './maintenance';
import { registerPatternCron } from './patterns';
import { db } from '../db/client';

const TZ = 'Asia/Tashkent';

function safeRun(name: string, fn: () => Promise<void>): void {
  fn().catch((err) => {
    console.error(`[scheduler] ${name} error:`, err);
  });
}

export function startScheduler(bot: Telegraf, whoop: WhoopService): void {
  // 10:00 — stale fallback (reconciliation for missed webhooks)
  cron.schedule('0 10 * * *', () => safeRun('stale', () => runStaleFallback(bot, whoop)), { timezone: TZ });

  // Every minute — check and deliver briefs for fixed briefTime users
  cron.schedule('* * * * *', () => safeRun('deliver', () => checkAndDeliverBriefs(bot, whoop)), { timezone: TZ });

  // Sunday 21:00 Tashkent — weekly summary
  cron.schedule('0 21 * * 0', () => safeRun('weekly', () => sendWeeklySummaries(bot)), { timezone: TZ });

  // 05:00 UTC (10:00 Tashkent) — pattern detection
  registerPatternCron(bot, db);

  // Maintenance: trial warnings, expiry reminders
  startMaintenanceCron(bot);

  console.log('[scheduler] all cron jobs registered');
}
