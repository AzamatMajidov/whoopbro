import { Telegraf } from 'telegraf';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { DailySnapshot } from '@prisma/client';
import { db } from '../db/client';
import { config } from '../config';
import { type Lang } from '../i18n';
import { getUserLang } from '../i18n/getLang';

function calcStdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sqDiffs = values.map((v) => (v - mean) ** 2);
  return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / values.length);
}

function recoveryEmoji(score: number | null): string {
  if (score === null) return '\uD83D\uDD34';
  if (score >= 67) return '\uD83D\uDFE2';
  if (score >= 34) return '\uD83D\uDFE1';
  return '\uD83D\uDD34';
}

const MONTHS_SHORT: Record<Lang, string[]> = {
  uz: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr'],
  ru: ['\u044F\u043D\u0432', '\u0444\u0435\u0432', '\u043C\u0430\u0440', '\u0430\u043F\u0440', '\u043C\u0430\u0439', '\u0438\u044E\u043D', '\u0438\u044E\u043B', '\u0430\u0432\u0433', '\u0441\u0435\u043D', '\u043E\u043A\u0442', '\u043D\u043E\u044F', '\u0434\u0435\u043A'],
};

function formatDateShort(dateStr: string, lang: Lang): string {
  const d = new Date(`${dateStr}T12:00:00+05:00`);
  return `${d.getDate()}-${MONTHS_SHORT[lang][d.getMonth()]}`;
}

const LABELS: Record<Lang, {
  weekly_title: string;
  avg_recovery: string;
  avg_hrv: string;
  avg_sleep: string;
  sleep_consistency: string;
  weekly_strain: string;
  footer: string;
  consistency_good: string;
  consistency_mid: string;
  consistency_bad: string;
  ai_fallback: string;
  ai_system: string;
  ai_prompt_template: string;
  best_day: string;
  worst_day: string;
  sleep_short_h: string;
  sleep_short_m: string;
}> = {
  uz: {
    weekly_title: '\uD83D\uDCCA Haftalik hisobot',
    avg_recovery: "O'rtacha tiklanish",
    avg_hrv: "O'rtacha HRV",
    avg_sleep: "O'rtacha uyqu",
    sleep_consistency: 'Uyqu tartibi',
    weekly_strain: "Haftalik zo'riqish",
    footer: '\u26A0\uFE0F Bu tibbiy maslahat emas',
    consistency_good: 'Yaxshi',
    consistency_mid: "O'rtacha",
    consistency_bad: 'Yomon',
    ai_fallback: 'AI tahlil vaqtinchalik mavjud emas.',
    ai_system: "Sen shaxsiy salomatlik murabbiyi. Qisqa, iliq, amaliy maslahat berasan. Faqat o'zbek tilida yoz.",
    ai_prompt_template: '7 kunlik salomatlik tahlili',
    best_day: 'Eng yaxshi kun',
    worst_day: 'Eng qiyin kun',
    sleep_short_h: 's',
    sleep_short_m: 'd',
  },
  ru: {
    weekly_title: '\uD83D\uDCCA \u041D\u0435\u0434\u0435\u043B\u044C\u043D\u044B\u0439 \u043E\u0442\u0447\u0451\u0442',
    avg_recovery: '\u0421\u0440. \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435',
    avg_hrv: '\u0421\u0440. \u0412\u0421\u0420',
    avg_sleep: '\u0421\u0440. \u0441\u043E\u043D',
    sleep_consistency: '\u0420\u0435\u0436\u0438\u043C \u0441\u043D\u0430',
    weekly_strain: '\u041D\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0437\u0430 \u043D\u0435\u0434\u0435\u043B\u044E',
    footer: '\u26A0\uFE0F \u042D\u0442\u043E \u043D\u0435 \u043C\u0435\u0434\u0438\u0446\u0438\u043D\u0441\u043A\u0430\u044F \u043A\u043E\u043D\u0441\u0443\u043B\u044C\u0442\u0430\u0446\u0438\u044F',
    consistency_good: '\u0425\u043E\u0440\u043E\u0448\u0438\u0439',
    consistency_mid: '\u0421\u0440\u0435\u0434\u043D\u0438\u0439',
    consistency_bad: '\u041F\u043B\u043E\u0445\u043E\u0439',
    ai_fallback: 'AI-\u0430\u043D\u0430\u043B\u0438\u0437 \u0432\u0440\u0435\u043C\u0435\u043D\u043D\u043E \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D.',
    ai_system: '\u0422\u044B \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B\u044C\u043D\u044B\u0439 \u0442\u0440\u0435\u043D\u0435\u0440 \u043F\u043E \u0437\u0434\u043E\u0440\u043E\u0432\u044C\u044E. \u041F\u0438\u0448\u0438 \u043A\u0440\u0430\u0442\u043A\u043E, \u0442\u0451\u043F\u043B\u043E, \u0434\u0430\u0432\u0430\u0439 \u043F\u0440\u0430\u043A\u0442\u0438\u0447\u043D\u044B\u0435 \u0441\u043E\u0432\u0435\u0442\u044B. \u041F\u0438\u0448\u0438 \u0442\u043E\u043B\u044C\u043A\u043E \u043D\u0430 \u0440\u0443\u0441\u0441\u043A\u043E\u043C \u044F\u0437\u044B\u043A\u0435.',
    ai_prompt_template: '\u0410\u043D\u0430\u043B\u0438\u0437 \u0437\u0434\u043E\u0440\u043E\u0432\u044C\u044F \u0437\u0430 7 \u0434\u043D\u0435\u0439',
    best_day: '\u041B\u0443\u0447\u0448\u0438\u0439 \u0434\u0435\u043D\u044C',
    worst_day: '\u0422\u044F\u0436\u0451\u043B\u044B\u0439 \u0434\u0435\u043D\u044C',
    sleep_short_h: '\u0447',
    sleep_short_m: '\u043C',
  },
};

export async function generateAndSendWeeklySummary(userId: bigint, bot: Telegraf): Promise<void> {
  const lang = await getUserLang(userId);
  const l = LABELS[lang];

  const snapshots = await db.dailySnapshot.findMany({
    where: {
      userId,
      fetchStatus: { in: ['READY', 'STALE'] },
      date: {
        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
    },
    orderBy: { date: 'desc' },
    take: 7,
  });

  if (snapshots.length < 3) return;

  const recoveryVals = snapshots.map((s) => s.recoveryScore).filter((v): v is number => v !== null);
  const hrvVals = snapshots.map((s) => s.hrv).filter((v): v is number => v !== null);
  const sleepVals = snapshots.map((s) => s.sleepDuration).filter((v): v is number => v !== null);
  const strainVals = snapshots.map((s) => s.strainScore).filter((v): v is number => v !== null);
  const calorieVals = snapshots.map((s) => s.calories).filter((v): v is number => v !== null);

  const avgRecovery = recoveryVals.length > 0 ? Math.round(recoveryVals.reduce((a, b) => a + b, 0) / recoveryVals.length) : null;
  const avgHrv = hrvVals.length > 0 ? Math.round(hrvVals.reduce((a, b) => a + b, 0) / hrvVals.length) : null;
  const avgSleepMin = sleepVals.length > 0 ? Math.round(sleepVals.reduce((a, b) => a + b, 0) / sleepVals.length) : null;
  const totalStrain = strainVals.length > 0 ? Math.round(strainVals.reduce((a, b) => a + b, 0) * 10) / 10 : null;

  const sleepStdev = calcStdev(sleepVals);
  const consistency = sleepStdev <= 30 ? l.consistency_good : sleepStdev <= 60 ? l.consistency_mid : l.consistency_bad;

  const withRecovery = snapshots.filter((s) => s.recoveryScore !== null);
  const bestDay = withRecovery.length > 0
    ? withRecovery.reduce((best, s) => (s.recoveryScore! > best.recoveryScore!) ? s : best)
    : null;
  const worstDay = withRecovery.length > 0
    ? withRecovery.reduce((worst, s) => (s.recoveryScore! < worst.recoveryScore!) ? s : worst)
    : null;

  const bestDateStr = bestDay ? bestDay.date.toISOString().split('T')[0] : '';
  const worstDateStr = worstDay ? worstDay.date.toISOString().split('T')[0] : '';

  // Build Gemini prompt
  const promptLines = [
    `${l.ai_prompt_template}:`,
    `${l.avg_recovery}: ${avgRecovery ?? 'N/A'}%`,
    `${l.avg_hrv}: ${avgHrv ?? 'N/A'}ms`,
    `${l.avg_sleep}: ${avgSleepMin ?? 'N/A'} min`,
    `${l.sleep_consistency}: ${consistency}`,
    `${l.weekly_strain}: ${totalStrain ?? 'N/A'}`,
    `${l.best_day}: ${bestDateStr} (${bestDay?.recoveryScore ?? 'N/A'}%)`,
    `${l.worst_day}: ${worstDateStr} (${worstDay?.recoveryScore ?? 'N/A'}%)`,
  ];

  let aiInsight = '';
  try {
    const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.1-flash-lite-preview',
      systemInstruction: l.ai_system,
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('AI timeout')), 15_000);
    });
    const generatePromise = model.generateContent(promptLines.join('\n'));
    const result = await Promise.race([generatePromise, timeoutPromise]);
    aiInsight = result.response.text().trim();
  } catch {
    aiInsight = l.ai_fallback;
  }

  // Format dates
  const dates = snapshots.map((s) => s.date.toISOString().split('T')[0]);
  const startDate = formatDateShort(dates[dates.length - 1], lang);
  const endDate = formatDateShort(dates[0], lang);

  const avgSleepHours = avgSleepMin !== null ? Math.floor(avgSleepMin / 60) : 0;
  const avgSleepRemainder = avgSleepMin !== null ? avgSleepMin % 60 : 0;

  const lines: string[] = [];
  lines.push(`${l.weekly_title} \u2014 ${startDate} \u2014 ${endDate}`);
  lines.push('');
  if (avgRecovery !== null) lines.push(`${recoveryEmoji(avgRecovery)} ${l.avg_recovery}: ${avgRecovery}%`);
  if (avgHrv !== null) lines.push(`\uD83D\uDC93 ${l.avg_hrv}: ${avgHrv}ms`);
  if (avgSleepMin !== null) lines.push(`\uD83D\uDE34 ${l.avg_sleep}: ${avgSleepHours}${l.sleep_short_h} ${avgSleepRemainder}${l.sleep_short_m}`);
  lines.push(`\uD83D\uDCC5 ${l.sleep_consistency}: ${consistency}`);
  if (totalStrain !== null) lines.push(`\uD83D\uDD25 ${l.weekly_strain}: ${totalStrain}`);
  lines.push('');
  lines.push(aiInsight);
  lines.push('');
  lines.push(l.footer);

  const text = lines.join('\n');
  await bot.telegram.sendMessage(userId.toString(), text);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendWeeklySummaries(bot: Telegraf): Promise<void> {
  const users = await db.user.findMany({
    where: {
      whoopConnected: true,
      subscription: {
        status: { in: ['trial', 'active'] },
      },
    },
  });

  for (const user of users) {
    try {
      await generateAndSendWeeklySummary(user.id, bot);
      await delay(500);
    } catch (err) {
      console.error(`[weekly] failed for user ${user.id}:`, err);
    }
  }
}
