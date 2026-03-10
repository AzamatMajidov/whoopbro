import { DailySnapshot, PrismaClient } from '@prisma/client';
import { Telegraf } from 'telegraf';

type PatternType =
  | 'evening_strain_hrv_drop'
  | 'high_strain_low_recovery'
  | 'short_sleep_low_recovery';

type Lang = 'uz' | 'ru';

type PatternDefinition = {
  type: PatternType;
  count: (snapshots: DailySnapshot[]) => number;
  message: (occurrences: number, lang: Lang) => string;
};

const READY_FETCH_STATUSES = ['READY', 'STALE'];
const TASHKENT_TZ = 'Asia/Tashkent';

function getHourInTashkent(date: Date): number {
  return Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: TASHKENT_TZ,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(date));
}

function isNextDay(previous: Date, next: Date): boolean {
  const diffMs = next.getTime() - previous.getTime();
  return diffMs === 24 * 60 * 60 * 1000;
}

function getRollingHrvAverage(snapshots: DailySnapshot[], index: number): number | null {
  const history = snapshots
    .slice(Math.max(0, index - 7), index)
    .map((snapshot) => snapshot.hrv)
    .filter((value): value is number => value !== null);

  if (history.length === 0) {
    return null;
  }

  return history.reduce((sum, value) => sum + value, 0) / history.length;
}

function countPairs(
  snapshots: DailySnapshot[],
  predicate: (current: DailySnapshot, next: DailySnapshot, index: number) => boolean,
): number {
  let count = 0;

  for (let index = 0; index < snapshots.length - 1; index++) {
    const current = snapshots[index];
    const next = snapshots[index + 1];

    if (!isNextDay(current.date, next.date)) {
      continue;
    }

    if (predicate(current, next, index + 1)) {
      count++;
    }
  }

  return count;
}

const PATTERNS: PatternDefinition[] = [
  {
    type: 'evening_strain_hrv_drop',
    count: (snapshots) => countPairs(snapshots, (current, next, nextIndex) => {
      if (
        current.strainScore === null ||
        current.strainScore <= 15 ||
        current.latestWorkoutTime === null ||
        next.hrv === null
      ) {
        return false;
      }

      if (getHourInTashkent(current.latestWorkoutTime) < 19) {
        return false;
      }

      const averageHrv = getRollingHrvAverage(snapshots, nextIndex);
      if (averageHrv === null) {
        return false;
      }

      return next.hrv < averageHrv * 0.8;
    }),
    message: (occurrences, lang) => lang === 'ru'
      ? `🌙 Замечен паттерн: ${occurrences} раза за месяц — поздняя тяжёлая тренировка -> HRV на следующий день падает. Старайтесь заканчивать тренировки до 18:00.`
      : `🌙 Qiziq pattern topildi: so'nggi oyda ${occurrences} marta kechki og'ir trening -> ertangi HRV pasaygan. Kechki mashqlarni 18:00 gacha tugatishga harakat qiling.`,
  },
  {
    type: 'high_strain_low_recovery',
    count: (snapshots) => countPairs(snapshots, (current, next) => (
      current.strainScore !== null &&
      current.strainScore > 15 &&
      next.recoveryScore !== null &&
      next.recoveryScore < 50
    )),
    message: (occurrences, lang) => lang === 'ru'
      ? `🔥 Паттерн: ${occurrences} раза — высокий strain -> низкое восстановление. После тяжёлых дней нужен лёгкий день.`
      : `🔥 Pattern: ${occurrences} marta yuqori strain -> ertangi recovery past. Og'ir kundan keyin engil kun qo'shing.`,
  },
  {
    type: 'short_sleep_low_recovery',
    count: (snapshots) => countPairs(snapshots, (current, next) => (
      current.sleepDuration !== null &&
      current.sleepDuration < 360 &&
      next.recoveryScore !== null &&
      next.recoveryScore < 50
    )),
    message: (occurrences, lang) => lang === 'ru'
      ? `😴 Паттерн: ${occurrences} раза — меньше 6 часов сна -> низкое восстановление. Сон — лучший инструмент восстановления.`
      : `😴 Pattern: ${occurrences} marta 6 soatdan kam uyqu -> ertangi recovery past. Uyqu eng yaxshi tiklanish vositasi.`,
  },
];

export async function detectAndNotify(
  userId: bigint,
  db: PrismaClient,
  bot: Telegraf,
  lang: string,
): Promise<void> {
  const snapshots = await db.dailySnapshot.findMany({
    where: {
      userId,
      fetchStatus: { in: READY_FETCH_STATUSES },
      date: {
        gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      },
    },
    orderBy: { date: 'asc' },
  });

  if (snapshots.length < 7) {
    return;
  }

  const normalizedLang: Lang = lang === 'ru' ? 'ru' : 'uz';
  const existingPatterns = await db.userPattern.findMany({
    where: { userId },
  });
  const existingByType = new Map(existingPatterns.map((pattern) => [pattern.patternType, pattern]));

  for (const pattern of PATTERNS) {
    const occurrences = pattern.count(snapshots);

    await db.userPattern.upsert({
      where: {
        userId_patternType: {
          userId,
          patternType: pattern.type,
        },
      },
      create: {
        userId,
        patternType: pattern.type,
        occurrences,
      },
      update: {
        occurrences,
      },
    });

    const existing = existingByType.get(pattern.type);
    if (occurrences < 3 || existing?.notifiedAt !== null) {
      continue;
    }

    await bot.telegram.sendMessage(
      userId.toString(),
      pattern.message(occurrences, normalizedLang),
    );

    await db.userPattern.update({
      where: {
        userId_patternType: {
          userId,
          patternType: pattern.type,
        },
      },
      data: {
        notifiedAt: new Date(),
      },
    });
  }
}
