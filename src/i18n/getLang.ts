import { db } from '../db/client';
import type { Lang } from './index';

export async function getUserLang(userId: bigint): Promise<Lang> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { language: true } });
  return (user?.language === 'ru' ? 'ru' : 'uz') as Lang;
}
