import { Context, Markup } from 'telegraf';
import { Telegraf } from 'telegraf';
import { config } from '../../config';
import { db } from '../../db/client';
import { activatePaid } from '../../services/subscription';
import { deliverBrief } from '../../scheduler/deliver';
import { WhoopService } from '../../services/whoop';
import { t, type Lang } from '../../i18n';
import { getUserLang } from '../../i18n/getLang';
import { mainKeyboard } from '../keyboard';

export async function sendPaymentInstructions(ctx: Context): Promise<void> {
  const lang = ctx.from ? await getUserLang(BigInt(ctx.from.id)) : 'uz' as Lang;

  const text = `${t(lang, 'payment_title')}

${t(lang, 'payment_card_label')}
${config.CLICK_CARD}

${t(lang, 'payment_instruction')}`;

  await ctx.reply(text, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: t(lang, 'btn_paid'), callback_data: 'paid_confirm' },
          { text: t(lang, 'btn_cancel_payment'), callback_data: 'paid_cancel' },
        ],
      ],
    },
  });
}

export function registerPaymentCallbacks(bot: Telegraf, whoop: WhoopService): void {
  bot.action('subscribe', async (ctx) => {
    await ctx.answerCbQuery();
    await sendPaymentInstructions(ctx);
  });

  bot.action('paid_confirm', async (ctx) => {
    await ctx.answerCbQuery();
    const from = ctx.from;
    if (!from) return;

    const lang = await getUserLang(BigInt(from.id));
    const user = await db.user.findUnique({ where: { id: BigInt(from.id) } });

    // Notify admin (admin messages stay in Uzbek)
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });
    const adminMessage = `\uD83D\uDCB0 Yangi to'lov so'rovi
\uD83D\uDC64 ${user?.firstName ?? 'Noma\'lum'} (@${from.username ?? 'noma\'lum'})
\uD83C\uDD94 ${from.id}
\uD83D\uDCC5 ${dateStr}`;

    try {
      await bot.telegram.sendMessage(config.ADMIN_TELEGRAM_ID.toString(), adminMessage, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '\u2705 Faollashtirish', callback_data: `admin_activate:${from.id}` },
              { text: '\u274C Rad etish', callback_data: `admin_reject:${from.id}` },
            ],
          ],
        },
      });
    } catch (err) {
      console.error('[payment] admin notify failed:', err);
    }

    await ctx.reply(t(lang, 'payment_received'), mainKeyboard(lang));
  });

  bot.action('paid_cancel', async (ctx) => {
    await ctx.answerCbQuery();
    const lang = ctx.from ? await getUserLang(BigInt(ctx.from.id)) : 'uz' as Lang;
    await ctx.reply(t(lang, 'payment_cancelled'), mainKeyboard(lang));
  });

  // Admin callbacks (admin messages stay in Uzbek, but user notifications use user's lang)
  bot.action(/^admin_activate:(\d+)$/, async (ctx) => {
    if (ctx.from.id !== config.ADMIN_TELEGRAM_ID) return;
    await ctx.answerCbQuery();

    const targetUserId = BigInt(ctx.match[1]);

    try {
      await activatePaid(targetUserId, 'manual');

      // Edit admin message
      await ctx.editMessageText(`\u2705 Faollashtirildi \u2014 ${targetUserId}`);

      // Get user info for response
      const user = await db.user.findUnique({ where: { id: targetUserId } });
      const briefTime = user?.briefTime ?? '07:00';
      const lang: Lang = user?.language === 'ru' ? 'ru' : 'uz';

      // Notify user in their language
      await bot.telegram.sendMessage(
        targetUserId.toString(),
        t(lang, 'sub_activated', briefTime),
        mainKeyboard(lang),
      );

      // Check if user missed today's brief — deliver immediately
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });
      const dateObj = new Date(`${today}T00:00:00Z`);
      const snapshot = await db.dailySnapshot.findUnique({
        where: { userId_date: { userId: targetUserId, date: dateObj } },
      });

      if (snapshot && !snapshot.deliveredAt && ['READY', 'STALE'].includes(snapshot.fetchStatus)) {
        setImmediate(() => {
          deliverBrief(targetUserId, snapshot, bot, whoop).catch((err) => {
            console.error('[payment] immediate brief delivery failed:', err);
          });
        });
      }
    } catch (err) {
      console.error('[payment] activation failed:', err);
      await ctx.editMessageText(`\u274C Faollashtirish xatolik \u2014 ${targetUserId}`);
    }
  });

  bot.action(/^admin_reject:(\d+)$/, async (ctx) => {
    if (ctx.from.id !== config.ADMIN_TELEGRAM_ID) return;
    await ctx.answerCbQuery();

    const targetUserId = BigInt(ctx.match[1]);

    await ctx.editMessageText(`\u274C Rad etildi \u2014 ${targetUserId}`);

    const lang = await getUserLang(targetUserId);

    try {
      await bot.telegram.sendMessage(
        targetUserId.toString(),
        t(lang, 'sub_rejected'),
        mainKeyboard(lang),
      );
    } catch (err) {
      console.error('[payment] reject notify failed:', err);
    }
  });
}

export async function handleAdminCommand(ctx: Context, bot: Telegraf, whoop: WhoopService): Promise<void> {
  const from = ctx.from;
  if (!from || from.id !== config.ADMIN_TELEGRAM_ID) return;

  const text = (ctx.message as any)?.text ?? '';
  const parts = text.split(/\s+/);

  if (parts[1] === 'activate' && parts[2]) {
    const targetUserId = BigInt(parts[2]);
    try {
      await activatePaid(targetUserId, 'manual');
      const user = await db.user.findUnique({ where: { id: targetUserId } });
      const briefTime = user?.briefTime ?? '07:00';
      const lang: Lang = user?.language === 'ru' ? 'ru' : 'uz';

      await bot.telegram.sendMessage(
        targetUserId.toString(),
        t(lang, 'sub_activated', briefTime),
        mainKeyboard(lang),
      );
      await ctx.reply(`\u2705 Faollashtirildi \u2014 ${targetUserId}`);
    } catch (err) {
      console.error('[admin] activate failed:', err);
      await ctx.reply(`\u274C Xatolik: ${err}`);
    }
    return;
  }

  if (parts[1] === 'stats') {
    const [totalUsers, whoopConnected, trialCount, activeCount, deliveredToday] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { whoopConnected: true } }),
      db.subscription.count({ where: { status: 'trial' } }),
      db.subscription.count({ where: { status: 'active' } }),
      (() => {
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });
        const dateObj = new Date(`${today}T00:00:00Z`);
        return db.dailySnapshot.count({
          where: { date: dateObj, deliveredAt: { not: null } },
        });
      })(),
    ]);

    const statsText = `\uD83D\uDCCA WhoopBro statistika
\uD83D\uDC65 Jami foydalanuvchilar: ${totalUsers}
\uD83D\uDD17 Whoop ulangan: ${whoopConnected}
\uD83C\uDFAF Sinov davri: ${trialCount}
\uD83D\uDCB3 Faol obuna: ${activeCount}
\uD83D\uDCC5 Bugun yuborilgan: ${deliveredToday}`;

    await ctx.reply(statsText);
    return;
  }

  await ctx.reply("Admin buyruqlari:\n/admin activate {userId}\n/admin stats");
}
