import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const configSchema = z.object({
  BOT_TOKEN: z.string().min(1, 'BOT_TOKEN is required'),
  WHOOP_CLIENT_ID: z.string().min(1, 'WHOOP_CLIENT_ID is required'),
  WHOOP_CLIENT_SECRET: z.string().min(1, 'WHOOP_CLIENT_SECRET is required'),
  WHOOP_REDIRECT_URI: z.string().url('WHOOP_REDIRECT_URI must be a valid URL'),
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  ENCRYPTION_KEY: z
    .string()
    .length(64, 'ENCRYPTION_KEY must be a 32-byte hex string (64 hex chars)'),
  WEBHOOK_SECRET: z.string().min(1, 'WEBHOOK_SECRET is required'),
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  ADMIN_TELEGRAM_ID: z.coerce.number().default(45118778),
});

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  parsed.error.issues.forEach((issue) => {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  });
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
