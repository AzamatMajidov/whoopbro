import { db } from '../db/client';

export interface SubscriptionStatus {
  status: 'trial' | 'active' | 'expired' | 'none';
  daysRemaining: number | null;
  trialEnd?: Date;
  paidUntil?: Date;
}

export async function hasAccess(userId: bigint): Promise<boolean> {
  const sub = await db.subscription.findUnique({ where: { userId } });
  if (!sub) return false;

  const now = new Date();

  if (sub.status === 'trial') {
    if (sub.trialEnd > now) return true;
    await db.subscription.update({ where: { userId }, data: { status: 'expired' } });
    return false;
  }

  if (sub.status === 'active') {
    if (sub.paidUntil !== null && sub.paidUntil > now) return true;
    await db.subscription.update({ where: { userId }, data: { status: 'expired' } });
    return false;
  }

  return false;
}

export async function getStatus(userId: bigint): Promise<SubscriptionStatus> {
  const sub = await db.subscription.findUnique({ where: { userId } });
  if (!sub) return { status: 'none', daysRemaining: null };

  const now = new Date();

  if (sub.status === 'trial') {
    if (sub.trialEnd > now) {
      return {
        status: 'trial',
        daysRemaining: Math.ceil((sub.trialEnd.getTime() - now.getTime()) / 86400000),
        trialEnd: sub.trialEnd,
      };
    }
    await db.subscription.update({ where: { userId }, data: { status: 'expired' } });
    return { status: 'expired', daysRemaining: null, trialEnd: sub.trialEnd };
  }

  if (sub.status === 'active') {
    if (sub.paidUntil !== null && sub.paidUntil > now) {
      return {
        status: 'active',
        daysRemaining: Math.ceil((sub.paidUntil.getTime() - now.getTime()) / 86400000),
        paidUntil: sub.paidUntil,
      };
    }
    await db.subscription.update({ where: { userId }, data: { status: 'expired' } });
    return { status: 'expired', daysRemaining: null, paidUntil: sub.paidUntil ?? undefined };
  }

  return { status: 'expired', daysRemaining: null };
}

export async function startTrial(userId: bigint): Promise<void> {
  const existing = await db.subscription.findUnique({ where: { userId } });
  if (existing) return;

  const now = new Date();
  await db.subscription.create({
    data: {
      userId,
      status: 'trial',
      trialStart: now,
      trialEnd: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
    },
  });
}

export async function activatePaid(userId: bigint, paymentRef?: string): Promise<void> {
  const sub = await db.subscription.findUnique({ where: { userId } });
  const now = new Date();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;

  if (sub && sub.status === 'active' && sub.paidUntil && sub.paidUntil > now) {
    // Extend from current paidUntil
    await db.subscription.update({
      where: { userId },
      data: {
        paidUntil: new Date(sub.paidUntil.getTime() + thirtyDays),
        paymentRef: paymentRef ?? sub.paymentRef,
      },
    });
  } else if (sub) {
    await db.subscription.update({
      where: { userId },
      data: {
        status: 'active',
        paidUntil: new Date(now.getTime() + thirtyDays),
        paymentRef: paymentRef ?? null,
      },
    });
  } else {
    await db.subscription.create({
      data: {
        userId,
        status: 'active',
        trialStart: now,
        trialEnd: now,
        paidUntil: new Date(now.getTime() + thirtyDays),
        paymentRef: paymentRef ?? null,
      },
    });
  }
}

export async function expireSubscription(userId: bigint): Promise<void> {
  await db.subscription.updateMany({
    where: { userId },
    data: { status: 'expired' },
  });
}
