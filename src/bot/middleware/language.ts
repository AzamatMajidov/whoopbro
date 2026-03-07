import { Context, MiddlewareFn } from 'telegraf';

export const languageMiddleware: MiddlewareFn<Context> = async (ctx, next) => {
  ctx.state.lang = ctx.state.dbUser?.language ?? 'uz';

  return next();
};
