import { createHmac } from 'crypto';
import { config } from '../config';

export function validateWhoopSignature(
  rawBody: Buffer,
  signature: string,
  timestamp: string,
): boolean {
  const payload = timestamp + rawBody.toString('utf8');
  const calculated = createHmac('sha256', config.WHOOP_CLIENT_SECRET)
    .update(payload)
    .digest('base64');
  return calculated === signature;
}
