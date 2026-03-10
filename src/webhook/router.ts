import { Router, Request, Response } from 'express';
import { Telegraf } from 'telegraf';
import { WhoopService } from '../services/whoop';
import { validateWhoopSignature } from './validate';
import { handleWebhookEvent } from './handlers';

// Extend Request to carry rawBody
interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

export function createWebhookRouter(bot: Telegraf, whoop: WhoopService): Router {
  const router = Router();

  // Collect raw body before any JSON parsing
  router.post('/webhook/whoop', (req: RawBodyRequest, res: Response) => {
    const chunks: Buffer[] = [];

    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    req.on('end', () => {
      const rawBody = Buffer.concat(chunks);

      // Respond 200 immediately (Whoop requires < 1s)
      res.status(200).json({ ok: true });

      // Validate signature
      const signature = req.headers['x-whoop-signature'] as string | undefined;
      const timestamp = req.headers['x-whoop-signature-timestamp'] as string | undefined;

      if (!signature || !timestamp) {
        console.warn('[webhook] missing signature headers');
        return;
      }

      if (!validateWhoopSignature(rawBody, signature, timestamp)) {
        console.warn('[webhook] invalid signature');
        return;
      }

      // Parse and process async
      let payload: any;
      try {
        payload = JSON.parse(rawBody.toString('utf8'));
      } catch {
        console.error('[webhook] invalid JSON body');
        return;
      }

      handleWebhookEvent(payload, bot, whoop).catch((err) => {
        console.error('[webhook] handleWebhookEvent error:', err);
      });
    });
  });

  return router;
}
