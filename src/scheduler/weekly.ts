import { Telegraf } from 'telegraf';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { DailySnapshot, UserPattern } from '@prisma/client';
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

const MONTHS_SHORT: Record<Lang, string[]> = {
  uz: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr'],
  ru: ['\u044F\u043D\u0432', '\u0444\u0435\u0432', '\u043C\u0430\u0440', '\u0430\u043F\u0440', '\u043C\u0430\u0439', '\u0438\u044E\u043D', '\u0438\u044E\u043B', '\u0430\u0432\u0433', '\u0441\u0435\u043D', '\u043E\u043A\u0442', '\u043D\u043E\u044F', '\u0434\u0435\u043A'],
};

function formatDateShort(dateStr: string, lang: Lang): string {
  const d = new Date(`${dateStr}T12:00:00+05:00`);
  return `${d.getDate()}-${MONTHS_SHORT[lang][d.getMonth()]}`;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatSnapshotDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function formatSleepCell(minutes: number | null): string {
  if (minutes === null) return 'N/A';
  return `${Math.round((minutes / 60) * 10) / 10}h`;
}

function formatActivePattern(pattern: UserPattern, lang: Lang): string {
  const descriptions: Record<string, Record<Lang, string>> = {
    evening_strain_hrv_drop: {
      uz: `Kechki og'ir mashg'ulotdan keyin HRV pasayadi (${pattern.occurrences} marta)`,
      ru: `После поздней тяжёлой тренировки HRV падает (${pattern.occurrences} раза)`,
    },
    high_strain_low_recovery: {
      uz: `Yuqori strain ertasi kuni recovery'ni tushiradi (${pattern.occurrences} marta)`,
      ru: `Высокий strain на следующий день снижает recovery (${pattern.occurrences} раза)`,
    },
    short_sleep_low_recovery: {
      uz: `6 soatdan kam uyqudan keyin recovery past bo'ladi (${pattern.occurrences} marta)`,
      ru: `После сна меньше 6 часов recovery проседает (${pattern.occurrences} раза)`,
    },
  };

  return descriptions[pattern.patternType]?.[lang]
    ?? `${pattern.patternType} (${pattern.occurrences})`;
}

function getRecoveryTrend(
  snapshotsAsc: DailySnapshot[],
  lang: Lang,
): { emoji: string; label: string } {
  const recoverySnapshots = snapshotsAsc.filter((snapshot) => snapshot.recoveryScore !== null);
  if (recoverySnapshots.length < 2) {
    return {
      emoji: '\u27A1\uFE0F',
      label: lang === 'ru' ? '\u0441\u0442\u0430\u0431\u0438\u043B\u044C\u043D\u043E' : 'barqaror',
    };
  }

  const midpoint = Math.floor(recoverySnapshots.length / 2);
  const firstHalf = recoverySnapshots.slice(0, midpoint);
  const secondHalf = recoverySnapshots.slice(midpoint);
  const firstAverage = average(firstHalf.map((snapshot) => snapshot.recoveryScore!));
  const secondAverage = average(secondHalf.map((snapshot) => snapshot.recoveryScore!));

  if (firstAverage === null || secondAverage === null) {
    return {
      emoji: '\u27A1\uFE0F',
      label: lang === 'ru' ? '\u0441\u0442\u0430\u0431\u0438\u043B\u044C\u043D\u043E' : 'barqaror',
    };
  }

  const delta = Math.round((secondAverage - firstAverage) * 10) / 10;
  if (delta > 5) {
    return {
      emoji: '\u2B06\uFE0F',
      label: lang === 'ru' ? '\u0443\u043B\u0443\u0447\u0448\u0430\u0435\u0442\u0441\u044F' : 'yaxshilanmoqda',
    };
  }

  if (delta < -5) {
    return {
      emoji: '\u2B07\uFE0F',
      label: lang === 'ru' ? '\u0443\u0445\u0443\u0434\u0448\u0430\u0435\u0442\u0441\u044F' : 'yomonlashmoqda',
    };
  }

  return {
    emoji: '\u27A1\uFE0F',
    label: lang === 'ru' ? '\u0441\u0442\u0430\u0431\u0438\u043B\u044C\u043D\u043E' : 'barqaror',
  };
}

const LABELS: Record<Lang, {
  weekly_title: string;
  avg_recovery: string;
  avg_hrv: string;
  avg_sleep: string;
  consistency: string;
  weekly_strain: string;
  footer: string;
  consistency_good: string;
  consistency_mid: string;
  consistency_bad: string;
  ai_fallback: string;
}> = {
  uz: {
    weekly_title: '\uD83D\uDCCA Haftalik hisobot',
    avg_recovery: 'Avg recovery',
    avg_hrv: 'Avg HRV',
    avg_sleep: 'Avg sleep',
    consistency: 'Consistency',
    weekly_strain: 'Weekly strain',
    footer: '\u26A0\uFE0F Bu tibbiy maslahat emas',
    consistency_good: 'good',
    consistency_mid: 'mid',
    consistency_bad: 'bad',
    ai_fallback: 'AI tahlil vaqtinchalik mavjud emas.',
  },
  ru: {
    weekly_title: '\uD83D\uDCCA \u041D\u0435\u0434\u0435\u043B\u044C\u043D\u044B\u0439 \u043E\u0442\u0447\u0451\u0442',
    avg_recovery: 'Avg recovery',
    avg_hrv: 'Avg HRV',
    avg_sleep: 'Avg sleep',
    consistency: 'Consistency',
    weekly_strain: 'Weekly strain',
    footer: '\u26A0\uFE0F \u042D\u0442\u043E \u043D\u0435 \u043C\u0435\u0434\u0438\u0446\u0438\u043D\u0441\u043A\u0430\u044F \u043A\u043E\u043D\u0441\u0443\u043B\u044C\u0442\u0430\u0446\u0438\u044F',
    consistency_good: 'good',
    consistency_mid: 'mid',
    consistency_bad: 'bad',
    ai_fallback: 'AI-\u0430\u043D\u0430\u043B\u0438\u0437 \u0432\u0440\u0435\u043C\u0435\u043D\u043D\u043E \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D.',
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
  const activePatterns = await db.userPattern.findMany({
    where: { userId, occurrences: { gte: 3 } },
  });

  if (snapshots.length < 3) return;

  const snapshotsAsc = [...snapshots].sort((left, right) => left.date.getTime() - right.date.getTime());

  const recoveryVals = snapshots.map((s) => s.recoveryScore).filter((v): v is number => v !== null);
  const hrvVals = snapshots.map((s) => s.hrv).filter((v): v is number => v !== null);
  const sleepVals = snapshots.map((s) => s.sleepDuration).filter((v): v is number => v !== null);
  const strainVals = snapshots.map((s) => s.strainScore).filter((v): v is number => v !== null);

  const avgRecovery = recoveryVals.length > 0 ? Math.round(recoveryVals.reduce((a, b) => a + b, 0) / recoveryVals.length) : null;
  const avgHrv = hrvVals.length > 0 ? Math.round(hrvVals.reduce((a, b) => a + b, 0) / hrvVals.length) : null;
  const avgSleepMin = sleepVals.length > 0 ? Math.round(sleepVals.reduce((a, b) => a + b, 0) / sleepVals.length) : null;
  const totalStrain = strainVals.length > 0 ? Math.round(strainVals.reduce((a, b) => a + b, 0) * 10) / 10 : null;

  const sleepStdev = calcStdev(sleepVals);
  const consistency = sleepStdev <= 30 ? l.consistency_good : sleepStdev <= 60 ? l.consistency_mid : l.consistency_bad;
  const trend = getRecoveryTrend(snapshotsAsc, lang);

  const systemPrompt = `You are a personal health coach writing a weekly narrative summary. Speak like a friend, not a doctor.
OUTPUT LANGUAGE: ${lang === 'ru' ? 'Russian' : 'Uzbek (conversational, not formal)'}.
FORMAT (strict):
- 4 short paragraphs, each separated by a blank line
- Para 1: Best day of the week + why (1-2 sentences)
- Para 2: Hardest day + what likely caused it (1-2 sentences)
- Para 3: One key pattern or trend noticed this week (1-2 sentences)
- Para 4: One specific focus for next week — concrete and actionable (1-2 sentences)
- No bullet points, no headers, no emojis
- Max 8 sentences total`;

  const tableLines = [
    'date | recovery | hrv | sleep hours | strain',
    ...snapshotsAsc.map((snapshot) => [
      formatSnapshotDate(snapshot.date),
      snapshot.recoveryScore ?? 'N/A',
      snapshot.hrv ?? 'N/A',
      formatSleepCell(snapshot.sleepDuration),
      snapshot.strainScore ?? 'N/A',
    ].join(' | ')),
  ];
  const promptSections = [
    'Weekly data table:',
    ...tableLines,
    '',
    `Recovery trend: ${trend.label}`,
  ];

  if (activePatterns.length > 0) {
    promptSections.push('Active patterns:');
    promptSections.push(...activePatterns.map((pattern) => `- ${formatActivePattern(pattern, lang)}`));
  } else {
    promptSections.push('Active patterns: none');
  }

  let aiInsight = '';
  try {
    const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.1-flash-lite-preview',
      systemInstruction: systemPrompt,
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('AI timeout')), 15_000);
    });
    const generatePromise = model.generateContent(promptSections.join('\n'));
    const result = await Promise.race([generatePromise, timeoutPromise]);
    aiInsight = result.response.text().trim();
  } catch {
    aiInsight = l.ai_fallback;
  }

  // Format dates
  const dates = snapshotsAsc.map((s) => formatSnapshotDate(s.date));
  const startDate = formatDateShort(dates[0], lang);
  const endDate = formatDateShort(dates[dates.length - 1], lang);

  const avgSleepHours = avgSleepMin !== null ? Math.floor(avgSleepMin / 60) : 0;
  const avgSleepRemainder = avgSleepMin !== null ? avgSleepMin % 60 : 0;

  const lines: string[] = [];
  lines.push(`${l.weekly_title} \u2014 ${startDate} \u2014 ${endDate}`);
  lines.push('');
  if (avgRecovery !== null) lines.push(`${trend.emoji} ${l.avg_recovery}: ${avgRecovery}% ${trend.label}`);
  if (avgHrv !== null) lines.push(`\uD83D\uDC93 ${l.avg_hrv}: ${avgHrv}ms`);
  if (avgSleepMin !== null) lines.push(`\uD83D\uDE34 ${l.avg_sleep}: ${avgSleepHours}h ${avgSleepRemainder}m \u00B7 ${l.consistency}: ${consistency}`);
  if (totalStrain !== null) lines.push(`\uD83D\uDD25 ${l.weekly_strain}: ${totalStrain}`);
  lines.push('');
  lines.push('\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
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
