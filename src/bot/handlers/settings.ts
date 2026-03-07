import { Context } from 'telegraf';
import { Telegraf } from 'telegraf';
import { db } from '../../db/client';
import { getStatus } from '../../services/subscription';
import { expireSubscription } from '../../services/subscription';
import { t, type Lang } from '../../i18n';
import { getUserLang } from '../../i18n/getLang';

// In-memory state for brief time change flow
const awaitingBriefTime = new Set<number>();

export function registerSettingsHandlers(bot: Telegraf): void {
  bot.command('settings', settingsHandler);
  bot.command('status', statusHandler);
  bot.command('disconnect', disconnectHandler);
  bot.command('uz', langHandler('uz'));
  bot.command('ru', langHandler('ru'));

  // Settings callbacks
  bot.action('settings_time', async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from) return;
    awaitingBriefTime.add(ctx.from.id);
    const lang = await getUserLang(BigInt(ctx.from.id));
    await ctx.reply(t(lang, 'time_prompt'));
  });

  bot.action('settings_lang', async (ctx) => {
    await ctx.answerCbQuery();
    const lang = ctx.from ? await getUserLang(BigInt(ctx.from.id)) : 'uz' as Lang;
    await ctx.reply(t(lang, 'lang_prompt'), {
      reply_markup: {
        inline_keyboard: [
          [
            { text: t(lang, 'lang_uz'), callback_data: 'set_lang_uz' },
            { text: t(lang, 'lang_ru'), callback_data: 'set_lang_ru' },
          ],
        ],
      },
    });
  });

  bot.action('settings_disconnect', async (ctx) => {
    await ctx.answerCbQuery();
    const lang = ctx.from ? await getUserLang(BigInt(ctx.from.id)) : 'uz' as Lang;
    await ctx.reply(t(lang, 'disconnect_confirm_prompt'), {
      reply_markup: {
        inline_keyboard: [
          [
            { text: t(lang, 'btn_disconnect_yes'), callback_data: 'confirm_disconnect' },
            { text: t(lang, 'btn_cancel'), callback_data: 'cancel_disconnect' },
          ],
        ],
      },
    });
  });

  bot.action('confirm_disconnect', async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from) return;
    const userId = BigInt(ctx.from.id);
    const lang = await getUserLang(userId);

    await db.whoopToken.deleteMany({ where: { userId } });
    await db.dailySnapshot.deleteMany({ where: { userId } });
    await expireSubscription(userId);
    await db.user.update({
      where: { id: userId },
      data: { whoopConnected: false },
    });

    await ctx.editMessageText(t(lang, 'disconnect_done'));
  });

  bot.action('cancel_disconnect', async (ctx) => {
    await ctx.answerCbQuery();
    const lang = ctx.from ? await getUserLang(BigInt(ctx.from.id)) : 'uz' as Lang;
    await ctx.editMessageText(t(lang, 'disconnect_cancelled'));
  });

  bot.action('set_lang_uz', async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from) return;
    await db.user.update({ where: { id: BigInt(ctx.from.id) }, data: { language: 'uz' } });
    await ctx.editMessageText(t('uz', 'lang_changed_uz'));
  });

  bot.action('set_lang_ru', async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from) return;
    await db.user.update({ where: { id: BigInt(ctx.from.id) }, data: { language: 'ru' } });
    await ctx.editMessageText(t('ru', 'lang_changed_ru'));
  });
}

export function isAwaitingBriefTime(userId: number): boolean {
  return awaitingBriefTime.has(userId);
}

export async function handleBriefTimeInput(ctx: Context): Promise<void> {
  const from = ctx.from;
  if (!from) return;
  const text = (ctx.message as any)?.text?.trim();
  if (!text) return;

  awaitingBriefTime.delete(from.id);
  const lang = await getUserLang(BigInt(from.id));

  // Validate HH:MM format
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    await ctx.reply(t(lang, 'time_invalid_format'));
    return;
  }

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);

  if (hours < 5 || hours > 22 || (hours === 5 && minutes < 30) || minutes >= 60) {
    await ctx.reply(t(lang, 'time_out_of_range'));
    return;
  }

  const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

  await db.user.update({
    where: { id: BigInt(from.id) },
    data: { briefTime: timeStr },
  });

  await ctx.reply(t(lang, 'time_saved', timeStr));
}

async function settingsHandler(ctx: Context): Promise<void> {
  const from = ctx.from;
  if (!from) return;
  const userId = BigInt(from.id);

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return;

  const lang: Lang = user.language === 'ru' ? 'ru' : 'uz';
  const subStatus = await getStatus(userId);
  const statusText = formatSubStatus(subStatus, lang);
  const langText = user.language === 'ru' ? '\u0420\u0443\u0441\u0441\u043A\u0438\u0439' : "O'zbek";

  const text = `${t(lang, 'settings_title')}

\u23F0 ${t(lang, 'settings_brief_time')}: ${user.briefTime}
\uD83C\uDF10 ${t(lang, 'settings_language')}: ${langText}
\uD83D\uDCB3 ${t(lang, 'settings_subscription')}: ${statusText}
\uD83D\uDD17 ${t(lang, 'settings_whoop')}: ${user.whoopConnected ? t(lang, 'settings_connected') : t(lang, 'settings_disconnected')}`;

  await ctx.reply(text, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: t(lang, 'btn_change_time'), callback_data: 'settings_time' },
          { text: t(lang, 'btn_language'), callback_data: 'settings_lang' },
        ],
        [{ text: t(lang, 'btn_disconnect_whoop'), callback_data: 'settings_disconnect' }],
      ],
    },
  });
}

async function statusHandler(ctx: Context): Promise<void> {
  const from = ctx.from;
  if (!from) return;
  const userId = BigInt(from.id);

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return;

  const lang: Lang = user.language === 'ru' ? 'ru' : 'uz';
  const subStatus = await getStatus(userId);
  const statusText = formatSubStatus(subStatus, lang);

  // Last brief delivery
  const lastSnapshot = await db.dailySnapshot.findFirst({
    where: { userId, deliveredAt: { not: null } },
    orderBy: { date: 'desc' },
  });

  const lastDelivery = lastSnapshot?.deliveredAt
    ? lastSnapshot.deliveredAt.toLocaleString('en-GB', { timeZone: 'Asia/Tashkent' })
    : t(lang, 'status_not_sent');

  const text = `${t(lang, 'status_title')}

\uD83D\uDD17 ${t(lang, 'settings_whoop')}: ${user.whoopConnected ? t(lang, 'settings_connected') : t(lang, 'settings_disconnected')}
\uD83D\uDCB3 ${t(lang, 'settings_subscription')}: ${statusText}
\uD83D\uDCC5 ${t(lang, 'status_last_brief')}: ${lastDelivery}
\u23F0 ${t(lang, 'status_brief_time')}: ${user.briefTime}`;

  await ctx.reply(text);
}

async function disconnectHandler(ctx: Context): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  const userId = BigInt(from.id);
  const user = await db.user.findUnique({ where: { id: userId } });
  const lang: Lang = user?.language === 'ru' ? 'ru' : 'uz';

  if (!user?.whoopConnected) {
    await ctx.reply(t(lang, 'disconnect_not_connected'));
    return;
  }

  await ctx.reply(t(lang, 'disconnect_confirm_prompt'), {
    reply_markup: {
      inline_keyboard: [
        [
          { text: t(lang, 'btn_disconnect_yes'), callback_data: 'confirm_disconnect' },
          { text: t(lang, 'btn_cancel'), callback_data: 'cancel_disconnect' },
        ],
      ],
    },
  });
}

function langHandler(lang: string) {
  return async (ctx: Context) => {
    const from = ctx.from;
    if (!from) return;
    await db.user.update({ where: { id: BigInt(from.id) }, data: { language: lang } });
    const l = lang as Lang;
    await ctx.reply(t(l, lang === 'ru' ? 'lang_changed_ru' : 'lang_changed_uz'));
  };
}

function formatSubStatus(sub: { status: string; daysRemaining: number | null }, lang: Lang): string {
  switch (sub.status) {
    case 'trial':
      return t(lang, 'sub_trial', String(sub.daysRemaining));
    case 'active':
      return t(lang, 'sub_active', String(sub.daysRemaining));
    case 'expired':
      return t(lang, 'sub_expired');
    default:
      return t(lang, 'sub_none');
  }
}
