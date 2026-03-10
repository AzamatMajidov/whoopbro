import { DailySnapshot } from '@prisma/client';
import { Telegraf } from 'telegraf';
import { db } from '../db/client';
import { WhoopService } from '../services/whoop';
import { generateBrief, AITimeoutError, AIRefusalError } from '../services/ai';
import {
  composeBrief,
  composeFallbackBrief,
  composePaywall,
  composeNoDevice,
} from '../services/brief';
import { DayData } from '../types/whoop';
import { t, type Lang } from '../i18n';

async function hasAccess(userId: bigint): Promise<boolean> {
  const sub = await db.subscription.findUnique({ where: { userId } });
  if (!sub) return false;

  const now = new Date();
  if (sub.status === 'trial') return sub.trialEnd > now;
  if (sub.status === 'active') return sub.paidUntil !== null && sub.paidUntil > now;
  return false;
}

function snapshotToDayData(snapshot: DailySnapshot, date: string): DayData {
  return {
    recovery: {
      recoveryScore: snapshot.recoveryScore,
      hrv: snapshot.hrv,
      rhr: snapshot.rhr,
      spo2: snapshot.spo2,
    },
    sleep: {
      durationMinutes: snapshot.sleepDuration,
      performancePct: snapshot.sleepPerf,
      efficiencyPct: snapshot.sleepEfficiency,
      remMinutes: snapshot.remMinutes,
      deepMinutes: snapshot.deepMinutes,
      lightMinutes: snapshot.lightMinutes,
      respiratoryRate: snapshot.respiratoryRate,
    },
    strain: {
      strainScore: snapshot.strainScore,
      calories: snapshot.calories,
    },
    workouts: [],
    woreDevice: snapshot.woreDevice,
    date,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendWithRetry(
  bot: Telegraf,
  userId: bigint,
  text: string,
  keyboard: any[][] | undefined,
  retries = 3,
): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await bot.telegram.sendMessage(userId.toString(), text, {
        parse_mode: 'Markdown',
        reply_markup: keyboard ? { inline_keyboard: keyboard } : undefined,
      });
      return;
    } catch (err) {
      if (attempt < retries) {
        console.error(`[deliver] send attempt ${attempt} failed for user ${userId}, retrying...`);
        await delay(5000);
      } else {
        throw err;
      }
    }
  }
}

export async function deliverBrief(
  userId: bigint,
  snapshot: DailySnapshot,
  bot: Telegraf,
  whoop: WhoopService,
  fromWebhook = false,
): Promise<void> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
  });

  const lang: Lang = user.language === 'ru' ? 'ru' : 'uz';
  const dateStr = snapshot.date.toISOString().split('T')[0];

  // Load last 7 snapshots for trend
  const history = await db.dailySnapshot.findMany({
    where: {
      userId,
      fetchStatus: { in: ['READY', 'STALE'] },
    },
    orderBy: { date: 'desc' },
    take: 7,
  });

  // Check access
  const access = await hasAccess(userId);
  if (!access) {
    const message = composePaywall(snapshot.recoveryScore, lang);
    try {
      await sendWithRetry(bot, userId, message.text, message.keyboard);
    } catch (err) {
      console.error(`[deliver] paywall send failed for user ${userId}:`, err);
    }
    await db.dailySnapshot.update({
      where: { userId_date: { userId, date: snapshot.date } },
      data: { deliveredAt: new Date() },
    });
    return;
  }

  const dayData = snapshotToDayData(snapshot, dateStr);

  // No device worn
  if (!snapshot.woreDevice) {
    const message = composeNoDevice(lang);
    try {
      await sendWithRetry(bot, userId, message.text, message.keyboard);
    } catch (err) {
      console.error(`[deliver] no-device send failed for user ${userId}:`, err);
    }
    await db.dailySnapshot.update({
      where: { userId_date: { userId, date: snapshot.date } },
      data: { deliveredAt: new Date() },
    });
    return;
  }

  // Generate AI brief
  let message;
  try {
    const aiText = await generateBrief(dayData, user, history);
    message = composeBrief(dayData, aiText, snapshot.isStale, lang);
  } catch (err) {
    if (err instanceof AITimeoutError || err instanceof AIRefusalError) {
      message = composeFallbackBrief(dayData, snapshot.isStale, lang);
    } else {
      throw err;
    }
  }

  // Check if delivery is late (briefTime + 30min) — skip for webhook-triggered briefs
  if (!fromWebhook) {
    const now = new Date();
    const [briefH, briefM] = user.briefTime.split(':').map(Number);
    const briefTimeToday = new Date(
      now.toLocaleString('en-US', { timeZone: 'Asia/Tashkent' }),
    );
    briefTimeToday.setHours(briefH, briefM, 0, 0);
    const lateThreshold = new Date(briefTimeToday.getTime() + 30 * 60 * 1000);
    const nowTashkent = new Date(
      now.toLocaleString('en-US', { timeZone: 'Asia/Tashkent' }),
    );

    if (nowTashkent > lateThreshold) {
      message.text = t(lang, 'late_notice') + '\n\n' + message.text;
    }
  }

  try {
    await sendWithRetry(bot, userId, message.text, message.keyboard);
  } catch (err) {
    console.error(`[deliver] brief send failed for user ${userId}:`, err);
  }

  await db.dailySnapshot.update({
    where: { userId_date: { userId, date: snapshot.date } },
    data: { deliveredAt: new Date() },
  });
}

export async function checkAndDeliverBriefs(bot: Telegraf, whoop: WhoopService): Promise<void> {
  const currentTime = new Date().toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Tashkent',
    hour: '2-digit',
    minute: '2-digit',
  });

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });
  const dateObj = new Date(`${today}T00:00:00Z`);

  const users = await db.user.findMany({
    where: {
      whoopConnected: true,
      briefTime: currentTime,
      snapshots: {
        some: {
          date: dateObj,
          fetchStatus: { in: ['READY', 'STALE'] },
          deliveredAt: null,
        },
      },
    },
    include: {
      snapshots: {
        where: {
          date: dateObj,
          fetchStatus: { in: ['READY', 'STALE'] },
          deliveredAt: null,
        },
      },
    },
  });

  const deliveries = users.map((user) => {
    const snapshot = user.snapshots[0];
    if (!snapshot) return Promise.resolve();
    return deliverBrief(user.id, snapshot, bot, whoop).catch((err) => {
      console.error(`[deliver] failed for user ${user.id}:`, err);
    });
  });

  await Promise.all(deliveries);
}
