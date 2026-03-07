import { Context, MiddlewareFn } from 'telegraf';

export const loggerMiddleware: MiddlewareFn<Context> = async (ctx, next) => {
  const updateType = ctx.updateType;
  const userId = ctx.from?.id;
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : undefined;

  console.log(`[${new Date().toISOString()}] ${updateType} from=${userId} text=${text ?? '-'}`);

  return next();
};
