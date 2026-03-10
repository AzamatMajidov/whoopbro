import { Telegraf } from 'telegraf';
import { db } from '../db/client';
import { WhoopService } from '../services/whoop';
import { snapshotFromDayData } from '../scheduler/prefetch';
import { deliverBrief } from '../scheduler/deliver';

interface WebhookPayload {
  user_id: number | string;
  id: string;
  type: string;
  trace_id: string;
}

function getTashkentToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });
}

async function handleRecoveryUpdated(
  whoopUserId: string,
  resourceId: string,
  bot: Telegraf,
  whoop: WhoopService,
): Promise<void> {
  const user = await db.user.findFirst({
    where: { whoopUserId, whoopConnected: true },
  });
  if (!user) {
    console.log(`[webhook] recovery.updated — no connected user for whoopUserId=${whoopUserId}`);
    return;
  }

  const today = getTashkentToday();
  const dateObj = new Date(`${today}T00:00:00Z`);

  const dayData = await whoop.fetchDayData(user.id, today);
  const input = snapshotFromDayData(user.id, today, dayData);

  await db.dailySnapshot.upsert({
    where: { userId_date: { userId: user.id, date: dateObj } },
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

  const snapshot = await db.dailySnapshot.findUniqueOrThrow({
    where: { userId_date: { userId: user.id, date: dateObj } },
  });

  await deliverBrief(user.id, snapshot, bot, whoop);
  console.log(`[webhook] recovery.updated — brief delivered for user ${user.id}`);
}

async function handleWorkoutUpdated(
  whoopUserId: string,
  resourceId: string,
  bot: Telegraf,
  whoop: WhoopService,
): Promise<void> {
  const user = await db.user.findFirst({
    where: { whoopUserId, whoopConnected: true },
  });
  if (!user) return;

  const workout = await whoop.fetchWorkoutById(user.id, resourceId);
  if (!workout) return;

  const today = getTashkentToday();
  const dateObj = new Date(`${today}T00:00:00Z`);

  // Ensure snapshot exists
  await db.dailySnapshot.upsert({
    where: { userId_date: { userId: user.id, date: dateObj } },
    create: { userId: user.id, date: dateObj, fetchStatus: 'PENDING' },
    update: {},
  });

  const currentSnap = await db.dailySnapshot.findUniqueOrThrow({
    where: { userId_date: { userId: user.id, date: dateObj } },
  });

  // Only update if this workout's strain >= current (keep highest of the day)
  if (workout.strain >= (currentSnap.workoutStrain ?? 0)) {
    await db.dailySnapshot.update({
      where: { userId_date: { userId: user.id, date: dateObj } },
      data: {
        latestWorkoutTime: workout.startTime,
        workoutStrain: workout.strain,
        latestWorkoutSport: workout.sport,
      },
    });
  }

  // Evening warning: strain > 14 AND workout hour in Tashkent >= 19
  const workoutHour = Number(
    workout.startTime.toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Tashkent',
      hour: '2-digit',
      hour12: false,
    }),
  );

  if (workout.strain > 14 && workoutHour >= 19) {
    const lang = user.language === 'ru' ? 'ru' : 'uz';
    const strainStr = workout.strain.toFixed(1);

    const message =
      lang === 'uz'
        ? `⚠️ Kechqurun eslatma: bugun kech vaqtda ogir trening qildingiz (strain: ${strainStr}). Ertangi recovery past bolishi mumkin. Imkon bolsa 23:00 gacha uxlashga harakat qiling. 💤`
        : `⚠️ Вечернее напоминание: сегодня поздняя тяжёлая тренировка (strain: ${strainStr}). Восстановление завтра может быть низким. Постарайтесь лечь спать до 23:00. 💤`;

    try {
      await bot.telegram.sendMessage(user.id.toString(), message);
      console.log(`[webhook] evening warning sent to user ${user.id} (strain: ${strainStr})`);
    } catch (err) {
      console.error(`[webhook] evening warning send failed for user ${user.id}:`, err);
    }
  }
}

export async function handleWebhookEvent(
  payload: WebhookPayload,
  bot: Telegraf,
  whoop: WhoopService,
): Promise<void> {
  const { id, type, trace_id } = payload;
  const whoopUserIdStr = String(payload.user_id); // Whoop sends user_id as integer

  // Deduplication check
  const existing = await db.webhookEvent.findUnique({ where: { traceId: trace_id } });
  if (existing) {
    console.log(`[webhook] duplicate trace_id=${trace_id}, skipping`);
    return;
  }

  // Record the event
  await db.webhookEvent.create({
    data: {
      traceId: trace_id,
      type,
      whoopUserId: whoopUserIdStr,
      resourceId: id,
    },
  });

  switch (type) {
    case 'recovery.updated':
      await handleRecoveryUpdated(whoopUserIdStr, id, bot, whoop);
      break;
    case 'workout.updated':
      await handleWorkoutUpdated(whoopUserIdStr, id, bot, whoop);
      break;
    default:
      console.log(`[webhook] unhandled event type=${type}, trace_id=${trace_id}`);
  }
}
