import { Prisma } from '@prisma/client';
import { Telegraf } from 'telegraf';
import { db } from '../db/client';
import { WhoopService, WhoopTokenExpiredError } from '../services/whoop';
import { DayData } from '../types/whoop';
import { deliverBrief } from './deliver';

function getTashkentToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });
}

export function snapshotFromDayData(
  userId: bigint,
  date: string,
  dayData: DayData,
): Prisma.DailySnapshotCreateInput {
  return {
    user: { connect: { id: userId } },
    date: new Date(`${date}T00:00:00Z`),
    recoveryScore: dayData.recovery.recoveryScore,
    hrv: dayData.recovery.hrv,
    rhr: dayData.recovery.rhr,
    spo2: dayData.recovery.spo2,
    sleepDuration: dayData.sleep.durationMinutes,
    sleepPerf: dayData.sleep.performancePct,
    sleepEfficiency: dayData.sleep.efficiencyPct,
    remMinutes: dayData.sleep.remMinutes,
    deepMinutes: dayData.sleep.deepMinutes,
    lightMinutes: dayData.sleep.lightMinutes,
    respiratoryRate: dayData.sleep.respiratoryRate,
    strainScore: dayData.strain.strainScore,
    calories: dayData.strain.calories,
    woreDevice: dayData.woreDevice,
    fetchStatus: 'READY',
    fetchedAt: new Date(),
    rawJson: dayData as unknown as Prisma.InputJsonValue,
  };
}

export async function attemptFetch(
  userId: bigint,
  date: string,
  whoop: WhoopService,
): Promise<'READY' | 'FAILED'> {
  const dateObj = new Date(`${date}T00:00:00Z`);

  // Mark as FETCHING and increment attempts
  await db.dailySnapshot.upsert({
    where: { userId_date: { userId, date: dateObj } },
    create: {
      userId,
      date: dateObj,
      fetchStatus: 'FETCHING',
      fetchAttempts: 1,
    },
    update: {
      fetchStatus: 'FETCHING',
      fetchAttempts: { increment: 1 },
    },
  });

  try {
    const dayData = await whoop.fetchDayData(userId, date);
    const input = snapshotFromDayData(userId, date, dayData);

    await db.dailySnapshot.upsert({
      where: { userId_date: { userId, date: dateObj } },
      create: input,
      update: {
        recoveryScore: input.recoveryScore,
        hrv: input.hrv,
        rhr: input.rhr,
        spo2: input.spo2,
        sleepDuration: input.sleepDuration,
        sleepPerf: input.sleepPerf,
        sleepEfficiency: input.sleepEfficiency,
        remMinutes: input.remMinutes,
        deepMinutes: input.deepMinutes,
        lightMinutes: input.lightMinutes,
        respiratoryRate: input.respiratoryRate,
        strainScore: input.strainScore,
        calories: input.calories,
        woreDevice: input.woreDevice,
        fetchStatus: 'READY',
        fetchedAt: new Date(),
        rawJson: input.rawJson,
      },
    });

    return 'READY';
  } catch (err) {
    if (err instanceof WhoopTokenExpiredError) {
      await db.dailySnapshot.update({
        where: { userId_date: { userId, date: dateObj } },
        data: { fetchStatus: 'FAILED' },
      });
      await db.user.update({
        where: { id: userId },
        data: { whoopConnected: false },
      });
      return 'FAILED';
    }

    console.error(`[prefetch] attemptFetch error for user ${userId}:`, err);
    await db.dailySnapshot.update({
      where: { userId_date: { userId, date: dateObj } },
      data: { fetchStatus: 'FAILED' },
    });
    return 'FAILED';
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runPrefetchSweep(whoop: WhoopService): Promise<void> {
  const today = getTashkentToday();
  const dateObj = new Date(`${today}T00:00:00Z`);

  const users = await db.user.findMany({
    where: { whoopConnected: true },
  });

  // Ensure PENDING snapshots exist for users that don't have READY/STALE ones
  for (const user of users) {
    await db.dailySnapshot.upsert({
      where: { userId_date: { userId: user.id, date: dateObj } },
      create: {
        userId: user.id,
        date: dateObj,
        fetchStatus: 'PENDING',
      },
      update: {},
    });
  }

  let ready = 0;
  let failed = 0;

  for (const user of users) {
    const result = await attemptFetch(user.id, today, whoop);
    if (result === 'READY') ready++;
    else failed++;

    if (users.indexOf(user) < users.length - 1) {
      await delay(500);
    }
  }

  console.log(`[prefetch] sweep done: ${ready} ready, ${failed} failed`);
}

export async function runRetryLoop(whoop: WhoopService): Promise<void> {
  const today = getTashkentToday();
  const dateObj = new Date(`${today}T00:00:00Z`);

  const snapshots = await db.dailySnapshot.findMany({
    where: {
      fetchStatus: 'FAILED',
      date: dateObj,
      fetchAttempts: { lt: 8 },
    },
  });

  let ready = 0;
  let failed = 0;

  for (let i = 0; i < snapshots.length; i++) {
    const result = await attemptFetch(snapshots[i].userId, today, whoop);
    if (result === 'READY') ready++;
    else failed++;

    if (i < snapshots.length - 1) {
      await delay(500);
    }
  }

  console.log(`[prefetch] retry done: ${ready} ready, ${failed} failed`);
}

export async function runStaleFallback(bot: Telegraf, whoop: WhoopService): Promise<void> {
  const today = getTashkentToday();
  const dateObj = new Date(`${today}T00:00:00Z`);

  const yesterday = new Date(dateObj);
  yesterday.setDate(yesterday.getDate() - 1);

  const snapshots = await db.dailySnapshot.findMany({
    where: {
      date: dateObj,
      fetchStatus: { in: ['PENDING', 'FAILED', 'FETCHING'] },
    },
  });

  for (const snap of snapshots) {
    const yesterdaySnap = await db.dailySnapshot.findUnique({
      where: { userId_date: { userId: snap.userId, date: yesterday } },
    });

    if (yesterdaySnap && yesterdaySnap.fetchStatus === 'READY') {
      // Copy yesterday's data as stale
      await db.dailySnapshot.update({
        where: { userId_date: { userId: snap.userId, date: dateObj } },
        data: {
          recoveryScore: yesterdaySnap.recoveryScore,
          hrv: yesterdaySnap.hrv,
          rhr: yesterdaySnap.rhr,
          spo2: yesterdaySnap.spo2,
          sleepDuration: yesterdaySnap.sleepDuration,
          sleepPerf: yesterdaySnap.sleepPerf,
          sleepEfficiency: yesterdaySnap.sleepEfficiency,
          remMinutes: yesterdaySnap.remMinutes,
          deepMinutes: yesterdaySnap.deepMinutes,
          lightMinutes: yesterdaySnap.lightMinutes,
          respiratoryRate: yesterdaySnap.respiratoryRate,
          strainScore: yesterdaySnap.strainScore,
          calories: yesterdaySnap.calories,
          woreDevice: yesterdaySnap.woreDevice,
          rawJson: yesterdaySnap.rawJson ?? undefined,
          isStale: true,
          fetchStatus: 'STALE',
          fetchedAt: new Date(),
        },
      });
    } else {
      // No yesterday data — mark as no device
      await db.dailySnapshot.update({
        where: { userId_date: { userId: snap.userId, date: dateObj } },
        data: {
          woreDevice: false,
          fetchStatus: 'STALE',
          isStale: true,
          fetchedAt: new Date(),
        },
      });
    }

    // Deliver the brief for this stale snapshot
    const updatedSnap = await db.dailySnapshot.findUniqueOrThrow({
      where: { userId_date: { userId: snap.userId, date: dateObj } },
    });

    try {
      await deliverBrief(snap.userId, updatedSnap, bot, whoop);
    } catch (err) {
      console.error(`[prefetch] stale delivery failed for user ${snap.userId}:`, err);
    }
  }

  console.log(`[prefetch] stale fallback done: ${snapshots.length} users processed`);
}
