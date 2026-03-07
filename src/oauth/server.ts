import express from 'express';
import rateLimit from 'express-rate-limit';
import { Telegraf } from 'telegraf';
import { config } from '../config';
import { createOAuthRouter } from './handler';

export function startOAuthServer(bot: Telegraf): void {
  const app = express();

  // Rate limit: 10 requests per minute per IP
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: 10,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  const router = createOAuthRouter(bot);
  app.use('/', router);

  app.listen(config.PORT, () => {
    console.log(`🌐 OAuth server listening on port ${config.PORT}`);
  });
}
