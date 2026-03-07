import 'dotenv/config';
import { db } from './db/client';
import { WhoopService } from './services/whoop';
import { Telegraf } from 'telegraf';
import { config } from './config';
import { deliverBrief } from './scheduler/deliver';

async function main() {
  const userId = BigInt(45118778);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });
  const dateObj = new Date(`${today}T00:00:00Z`);
  const bot = new Telegraf(config.BOT_TOKEN);
  const whoop = new WhoopService(db);

  console.log('Fetching real Whoop data...');
  const d = await whoop.fetchDayData(userId, today);
  console.log('Got data — recovery:', d.recovery.recoveryScore, 'sleep:', d.sleep.durationMinutes, 'min');

  const snapshot = await db.dailySnapshot.upsert({
    where: { userId_date: { userId, date: dateObj } },
    create: {
      userId, date: dateObj,
      recoveryScore: d.recovery.recoveryScore, hrv: d.recovery.hrv,
      rhr: d.recovery.rhr, spo2: d.recovery.spo2,
      sleepDuration: d.sleep.durationMinutes, sleepPerf: d.sleep.performancePct,
      sleepEfficiency: d.sleep.efficiencyPct, remMinutes: d.sleep.remMinutes,
      deepMinutes: d.sleep.deepMinutes, lightMinutes: d.sleep.lightMinutes,
      respiratoryRate: d.sleep.respiratoryRate,
      strainScore: d.strain.strainScore, calories: d.strain.calories,
      woreDevice: d.woreDevice, fetchStatus: 'READY', fetchedAt: new Date(),
    },
    update: {
      recoveryScore: d.recovery.recoveryScore, hrv: d.recovery.hrv,
      rhr: d.recovery.rhr, spo2: d.recovery.spo2,
      sleepDuration: d.sleep.durationMinutes, sleepPerf: d.sleep.performancePct,
      sleepEfficiency: d.sleep.efficiencyPct, remMinutes: d.sleep.remMinutes,
      deepMinutes: d.sleep.deepMinutes, lightMinutes: d.sleep.lightMinutes,
      respiratoryRate: d.sleep.respiratoryRate,
      strainScore: d.strain.strainScore, calories: d.strain.calories,
      woreDevice: d.woreDevice, fetchStatus: 'READY', fetchedAt: new Date(), deliveredAt: null,
    },
  });

  console.log('Snapshot saved. Delivering brief...');
  await deliverBrief(userId, snapshot, bot, whoop);
  console.log('Done!');
  await db.$disconnect();
  process.exit(0);
}

main().catch(console.error);
