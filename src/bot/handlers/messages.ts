import { Context } from 'telegraf';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { DailySnapshot } from '@prisma/client';
import { db } from '../../db/client';
import { config } from '../../config';
import { WhoopService } from '../../services/whoop';
import { buildSystemPrompt, buildUserPrompt } from '../../services/ai';
import { composePaywall, composeFullDetail } from '../../services/brief';
import { DayData } from '../../types/whoop';
import { t, type Lang } from '../../i18n';
import { getUserLang } from '../../i18n/getLang';
import { mainKeyboard } from '../keyboard';
import { statusHandler, settingsHandler } from './settings';
import { sendPaymentInstructions } from './payment';

// In-memory flag for awaiting query
const awaitingQuery = new Map<number, boolean>();

function snapshotToDayData(snapshot: DailySnapshot): DayData {
  const dateStr = snapshot.date.toISOString().split('T')[0];
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
    date: dateStr,
  };
}

async function hasAccess(userId: bigint): Promise<boolean> {
  const sub = await db.subscription.findUnique({ where: { userId } });
  if (!sub) return false;

  const now = new Date();
  if (sub.status === 'trial') return sub.trialEnd > now;
  if (sub.status === 'active') return sub.paidUntil !== null && sub.paidUntil > now;
  return false;
}

function getTashkentToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });
}

const MENU_BUTTONS_UZ = ['📊 Holat', '⚙️ Sozlamalar', '💳 Obuna', '❓ Yordam'];
const MENU_BUTTONS_RU = ['📊 Статус', '⚙️ Настройки', '💳 Подписка', '❓ Помощь'];
const ALL_MENU_BUTTONS = [...MENU_BUTTONS_UZ, ...MENU_BUTTONS_RU];

async function handleMenuButton(ctx: Context, text: string): Promise<void> {
  const userId = BigInt(ctx.from!.id);
  const lang = await getUserLang(userId);

  if (text === '📊 Holat' || text === '📊 Статус') {
    return statusHandler(ctx);
  }
  if (text === '⚙️ Sozlamalar' || text === '⚙️ Настройки') {
    return settingsHandler(ctx);
  }
  if (text === '💳 Obuna' || text === '💳 Подписка') {
    return sendPaymentInstructions(ctx);
  }
  if (text === '❓ Yordam' || text === '❓ Помощь') {
    const msg = lang === 'ru'
      ? 'ℹ️ WhoopBro — ежедневные отчёты о здоровье на основе данных Whoop.\n\n📊 Статус — ваша подписка\n⚙️ Настройки — время, язык, Whoop\n💳 Подписка — оформить доступ\n\nПо вопросам: @azamajidov'
      : "ℹ️ WhoopBro — Whoop ma'lumotlari asosida kunlik sog'liq hisobotlari.\n\n📊 Holat — obuna holatingiz\n⚙️ Sozlamalar — vaqt, til, Whoop\n💳 Obuna — obuna bo'lish\n\nSavollar uchun: @azamajidov";
    await ctx.reply(msg, mainKeyboard(lang));
  }
}

export async function handleTextMessage(ctx: Context, whoop: WhoopService): Promise<void> {
  try {
    const from = ctx.from;
    if (!from) return;
    const userId = BigInt(from.id);
    const messageText = (ctx.message as any)?.text;
    if (!messageText) return;

    // Reply keyboard button routing
    if (ALL_MENU_BUTTONS.includes(messageText)) {
      return handleMenuButton(ctx, messageText);
    }

    const lang = await getUserLang(userId);

    // Access check
    const access = await hasAccess(userId);
    if (!access) {
      const today = getTashkentToday();
      const dateObj = new Date(`${today}T00:00:00Z`);
      const snapshot = await db.dailySnapshot.findUnique({
        where: { userId_date: { userId, date: dateObj } },
      });
      const message = composePaywall(snapshot?.recoveryScore ?? null, lang);
      await ctx.reply(message.text, {
        reply_markup: message.keyboard ? { inline_keyboard: message.keyboard } : undefined,
      });
      return;
    }

    const today = getTashkentToday();
    const dateObj = new Date(`${today}T00:00:00Z`);

    // Load today's snapshot
    let snapshot = await db.dailySnapshot.findUnique({
      where: { userId_date: { userId, date: dateObj } },
    });

    // Check on-demand limit
    if (snapshot && snapshot.onDemandCount >= 10) {
      await ctx.reply(t(lang, 'query_limit'), mainKeyboard(lang));
      return;
    }

    // If snapshot missing or not ready, try live fetch
    if (!snapshot || !['READY', 'STALE'].includes(snapshot.fetchStatus)) {
      try {
        const dayData = await whoop.fetchDayData(userId, today);
        // Upsert snapshot
        snapshot = await db.dailySnapshot.upsert({
          where: { userId_date: { userId, date: dateObj } },
          create: {
            userId,
            date: dateObj,
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
          },
          update: {
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
          },
        });
      } catch {
        // Silently ignore fetch errors
      }
    }

    // Build prompt
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return;

    const dayData = snapshot ? snapshotToDayData(snapshot) : null;
    const systemPrompt = buildSystemPrompt(lang);

    let userPrompt: string;
    if (dayData) {
      userPrompt = buildUserPrompt(dayData, user, []) + '\n\nFoydalanuvchi savoli: ' + messageText;
    } else {
      userPrompt = "Bugun ma'lumot mavjud emas.\n\nFoydalanuvchi savoli: " + messageText;
    }

    // Call Gemini
    const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.1-flash-lite-preview',
      systemInstruction: systemPrompt,
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('AI timeout')), 10_000);
    });
    const generatePromise = model.generateContent(userPrompt);
    const result = await Promise.race([generatePromise, timeoutPromise]);
    const aiText = result.response.text().trim();

    await ctx.reply(aiText, mainKeyboard(lang));

    // Increment onDemandCount
    await db.dailySnapshot.upsert({
      where: { userId_date: { userId, date: dateObj } },
      create: {
        userId,
        date: dateObj,
        onDemandCount: 1,
        woreDevice: snapshot?.woreDevice ?? true,
      },
      update: {
        onDemandCount: { increment: 1 },
      },
    });
  } catch {
    const lang = ctx.from ? await getUserLang(BigInt(ctx.from.id)).catch(() => 'uz' as Lang) : 'uz' as Lang;
    await ctx.reply(t(lang, 'query_error'), mainKeyboard(lang));
  }
}

export async function handleCallbackQuery(ctx: Context, whoop: WhoopService): Promise<void> {
  try {
    const callbackQuery = ctx.callbackQuery;
    if (!callbackQuery || !('data' in callbackQuery)) return;
    const data = callbackQuery.data;
    const from = ctx.from;
    if (!from) return;

    await ctx.answerCbQuery();

    const lang = await getUserLang(BigInt(from.id));

    if (data === 'ask') {
      awaitingQuery.set(from.id, true);
      await ctx.reply(t(lang, 'query_ask_prompt'), mainKeyboard(lang));
      return;
    }

    if (data === 'detail') {
      const userId = BigInt(from.id);
      const today = getTashkentToday();
      const dateObj = new Date(`${today}T00:00:00Z`);

      // Try today first, fall back to most recent ready snapshot
      let snapshot = await db.dailySnapshot.findUnique({
        where: { userId_date: { userId, date: dateObj } },
      });

      let isYesterday = false;
      if (!snapshot || snapshot.fetchStatus === 'PENDING' || snapshot.fetchStatus === 'FETCHING') {
        snapshot = await db.dailySnapshot.findFirst({
          where: { userId, fetchStatus: { in: ['READY', 'STALE'] } },
          orderBy: { date: 'desc' },
        });
        isYesterday = true;
      }

      if (snapshot) {
        const dayData = snapshotToDayData(snapshot);
        const detail = composeFullDetail(dayData, lang);
        const prefix = isYesterday
          ? (lang === 'ru' ? '📅 Данные за вчера:\n\n' : '📅 Kechagi ma\'lumotlar:\n\n')
          : '';
        await ctx.reply(prefix + detail, mainKeyboard(lang));
      } else {
        await ctx.reply(t(lang, 'query_no_data'), mainKeyboard(lang));
      }
      return;
    }

    // 'subscribe' callback is handled by payment.ts
  } catch (err) {
    console.error('[messages] callback query error:', err);
  }
}
