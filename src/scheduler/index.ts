import cron from 'node-cron';
import { Telegraf } from 'telegraf';
import { WhoopService } from '../services/whoop';
import { runPrefetchSweep, runRetryLoop, runStaleFallback } from './prefetch';
import { checkAndDeliverBriefs } from './deliver';
import { sendWeeklySummaries } from './weekly';
import { startMaintenanceCron } from './maintenance';

const TZ = 'Asia/Tashkent';

function safeRun(name: string, fn: () => Promise<void>): void {
  fn().catch((err) => {
    console.error(`[scheduler] ${name} error:`, err);
  });
}

export function startScheduler(bot: Telegraf, whoop: WhoopService): void {
  // 05:30 — prefetch sweep
  cron.schedule('30 5 * * *', () => safeRun('prefetch', () => runPrefetchSweep(whoop)), { timezone: TZ });

  // Retry loops: every 30min from 06:00 to 09:00
  cron.schedule('0 6 * * *', () => safeRun('retry', () => runRetryLoop(whoop)), { timezone: TZ });
  cron.schedule('30 6 * * *', () => safeRun('retry', () => runRetryLoop(whoop)), { timezone: TZ });
  cron.schedule('0 7 * * *', () => safeRun('retry', () => runRetryLoop(whoop)), { timezone: TZ });
  cron.schedule('30 7 * * *', () => safeRun('retry', () => runRetryLoop(whoop)), { timezone: TZ });
  cron.schedule('0 8 * * *', () => safeRun('retry', () => runRetryLoop(whoop)), { timezone: TZ });
  cron.schedule('30 8 * * *', () => safeRun('retry', () => runRetryLoop(whoop)), { timezone: TZ });
  cron.schedule('0 9 * * *', () => safeRun('retry', () => runRetryLoop(whoop)), { timezone: TZ });
  cron.schedule('30 9 * * *', () => safeRun('retry', () => runRetryLoop(whoop)), { timezone: TZ });

  // 10:00 — stale fallback
  cron.schedule('0 10 * * *', () => safeRun('stale', () => runStaleFallback(bot, whoop)), { timezone: TZ });

  // Every minute — check and deliver briefs
  cron.schedule('* * * * *', () => safeRun('deliver', () => checkAndDeliverBriefs(bot, whoop)), { timezone: TZ });

  // Sunday 21:00 Tashkent — weekly summary
  cron.schedule('0 21 * * 0', () => safeRun('weekly', () => sendWeeklySummaries(bot)), { timezone: TZ });

  // Maintenance: trial warnings, expiry reminders
  startMaintenanceCron(bot);

  console.log('[scheduler] all cron jobs registered');
}
