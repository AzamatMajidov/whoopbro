import { Context, MiddlewareFn } from 'telegraf';
import { db } from '../../db/client';

export const accessMiddleware: MiddlewareFn<Context> = async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const sub = await db.subscription.findUnique({
    where: { userId: BigInt(userId) },
  });

  if (!sub) {
    await ctx.reply('Obunangiz tugagan. Yangilash uchun /subscribe');
    return;
  }

  const now = new Date();

  if (sub.status === 'trial' && now < sub.trialEnd) {
    return next();
  }

  if (sub.status === 'active' && sub.paidUntil && now < sub.paidUntil) {
    return next();
  }

  // Auto-expire
  if (sub.status !== 'expired') {
    await db.subscription.update({
      where: { userId: BigInt(userId) },
      data: { status: 'expired' },
    });
  }

  await ctx.reply('Obunangiz tugagan. Yangilash uchun /subscribe');
};
