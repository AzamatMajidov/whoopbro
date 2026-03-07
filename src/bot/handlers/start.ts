import crypto from 'crypto';
import { Context, Markup } from 'telegraf';
import { config } from '../../config';
import { db } from '../../db/client';
import { t, type Lang } from '../../i18n';

export async function startHandler(ctx: Context) {
  const from = ctx.from;
  if (!from) return;

  const userId = BigInt(from.id);

  // Upsert user
  await db.user.upsert({
    where: { id: userId },
    create: {
      id: userId,
      username: from.username ?? null,
      firstName: from.first_name ?? null,
    },
    update: {
      username: from.username ?? undefined,
      firstName: from.first_name ?? undefined,
      lastActiveAt: new Date(),
    },
  });

  // Check if already connected
  const user = await db.user.findUnique({ where: { id: userId } });
  const lang: Lang = user?.language === 'ru' ? 'ru' : 'uz';

  if (user?.whoopConnected) {
    await ctx.reply(t(lang, 'already_connected'));
    return;
  }

  // Generate OAuth state
  const state = crypto.randomUUID();

  await db.oAuthState.upsert({
    where: { state },
    create: {
      state,
      userId,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
    update: {
      userId,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  // Clean up any old states for this user
  await db.oAuthState.deleteMany({
    where: {
      userId,
      state: { not: state },
    },
  });

  const scopes = 'read:recovery read:sleep read:cycles read:workout read:profile offline';
  const oauthUrl =
    `https://api.prod.whoop.com/oauth/oauth2/auth` +
    `?client_id=${encodeURIComponent(config.WHOOP_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(config.WHOOP_REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&response_type=code` +
    `&state=${encodeURIComponent(state)}`;

  await ctx.reply(
    t(lang, 'welcome'),
    Markup.inlineKeyboard([Markup.button.url(t(lang, 'connect_button'), oauthUrl)]),
  );
}
