import { Context, MiddlewareFn } from 'telegraf';
import { db } from '../../db/client';

export const userMiddleware: MiddlewareFn<Context> = async (ctx, next) => {
  const from = ctx.from;
  if (!from) return next();

  const userId = BigInt(from.id);

  const dbUser = await db.user.upsert({
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

  ctx.state.dbUser = dbUser;

  return next();
};
