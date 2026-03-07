import crypto from 'crypto';
import { Context, Markup } from 'telegraf';
import { config } from '../../config';
import { db } from '../../db/client';

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
  if (user?.whoopConnected) {
    await ctx.reply(
      "Whoop hisobingiz allaqachon ulangan ✅\n\nSozlamalar uchun /settings, holatni ko'rish uchun /status",
    );
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

  const scopes = 'read:recovery read:sleep read:workout read:body_measurement offline';
  const oauthUrl =
    `https://api.prod.whoop.com/oauth/oauth2/auth` +
    `?client_id=${encodeURIComponent(config.WHOOP_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(config.WHOOP_REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&response_type=code` +
    `&state=${encodeURIComponent(state)}`;

  await ctx.reply(
    "🏋️ WhoopBro ga xush kelibsiz!\n\nHar kuni ertalab Whoop ma'lumotlaringiz asosida shaxsiy sog'liq tavsiyalari olasiz — o'zbek tilida.\n\nBoshlash uchun Whoop hisobingizni ulang 👇",
    Markup.inlineKeyboard([Markup.button.url('🔗 Whoop Hisobimni Ulash', oauthUrl)]),
  );
}
