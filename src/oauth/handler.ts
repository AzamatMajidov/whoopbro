import { Router, Request, Response } from 'express';
import axios from 'axios';
import { Telegraf } from 'telegraf';
import { db } from '../db/client';
import { config } from '../config';
import { encrypt } from '../utils/crypto';
import { WhoopService } from '../services/whoop';
import { deliverBrief } from '../scheduler/deliver';
import { t, type Lang } from '../i18n';
import { getUserLang } from '../i18n/getLang';

const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';

function htmlPage(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="uz">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f5f5f5;}
.card{background:#fff;padding:2rem;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.1);max-width:400px;text-align:center;}</style>
</head>
<body><div class="card">${body}</div></body></html>`;
}

export function createOAuthRouter(bot: Telegraf): Router {
  const router = Router();

  router.get('/whoop/callback', async (req: Request, res: Response) => {
    const { code, state, error } = req.query as Record<string, string | undefined>;

    // User denied access
    if (error === 'access_denied') {
      if (state) {
        const oauthState = await db.oAuthState.findUnique({ where: { state } });
        if (oauthState) {
          try {
            await bot.telegram.sendMessage(
              oauthState.userId.toString(),
              'Whoop ulanishi bekor qilindi. Qayta urinish uchun /start yuboring.',
            );
          } catch {
            // User may have blocked the bot
          }
          await db.oAuthState.delete({ where: { state } });
        }
      }
      res
        .status(200)
        .send(htmlPage('Bekor qilindi', '<h2>❌ Bekor qilindi</h2><p>Whoop ulanishi bekor qilindi. Telegramga qayting va /start yuboring.</p>'));
      return;
    }

    // Validate state
    if (!state || !code) {
      res.status(400).send(htmlPage('Xatolik', '<h2>⚠️ Xatolik</h2><p>Noto\'g\'ri so\'rov. /start buyrug\'ini qayta yuboring.</p>'));
      return;
    }

    const oauthState = await db.oAuthState.findUnique({ where: { state } });

    if (!oauthState || oauthState.expiresAt < new Date()) {
      if (oauthState) {
        await db.oAuthState.delete({ where: { state } });
      }
      res.status(400).send(htmlPage('Muddati o\'tgan', '<h2>⏰ Havola muddati o\'tgan</h2><p>/start buyrug\'ini qayta yuboring.</p>'));
      return;
    }

    const userId = oauthState.userId;

    // Delete state immediately (single use)
    await db.oAuthState.delete({ where: { state } });

    // Exchange code for tokens
    try {
      const tokenResponse = await axios.post(
        TOKEN_URL,
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: config.WHOOP_REDIRECT_URI,
          client_id: config.WHOOP_CLIENT_ID,
          client_secret: config.WHOOP_CLIENT_SECRET,
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );

      const { access_token, refresh_token, expires_in, user_id } = tokenResponse.data;

      // Store encrypted tokens
      await db.whoopToken.upsert({
        where: { userId },
        create: {
          userId,
          accessToken: encrypt(access_token),
          refreshToken: encrypt(refresh_token),
          expiresAt: new Date(Date.now() + expires_in * 1000),
        },
        update: {
          accessToken: encrypt(access_token),
          refreshToken: encrypt(refresh_token),
          expiresAt: new Date(Date.now() + expires_in * 1000),
        },
      });

      // Mark user as connected
      await db.user.update({
        where: { id: userId },
        data: {
          whoopConnected: true,
          whoopUserId: user_id ? String(user_id) : null,
        },
      });

      // Create trial subscription
      const now = new Date();
      await db.subscription.upsert({
        where: { userId },
        create: {
          userId,
          status: 'trial',
          trialStart: now,
          trialEnd: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
        },
        update: {
          status: 'trial',
          trialStart: now,
          trialEnd: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
        },
      });

      // Notify user via Telegram
      try {
        const lang = await getUserLang(userId);
        await bot.telegram.sendMessage(
          userId.toString(),
          t(lang, 'oauth_success_brief'),
        );
      } catch {
        // User may have blocked the bot
      }

      // Fetch and deliver first brief immediately (async — don't block OAuth response)
      setImmediate(async () => {
        try {
          const whoop = new WhoopService(db);
          const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });
          const dateObj = new Date(`${today}T00:00:00Z`);
          const dayData = await whoop.fetchDayData(userId, today);

          const snapshot = await db.dailySnapshot.upsert({
            where: { userId_date: { userId, date: dateObj } },
            create: {
              userId, date: dateObj,
              recoveryScore: dayData.recovery.recoveryScore, hrv: dayData.recovery.hrv,
              rhr: dayData.recovery.rhr, spo2: dayData.recovery.spo2,
              sleepDuration: dayData.sleep.durationMinutes, sleepPerf: dayData.sleep.performancePct,
              sleepEfficiency: dayData.sleep.efficiencyPct, remMinutes: dayData.sleep.remMinutes,
              deepMinutes: dayData.sleep.deepMinutes, lightMinutes: dayData.sleep.lightMinutes,
              respiratoryRate: dayData.sleep.respiratoryRate,
              strainScore: dayData.strain.strainScore, calories: dayData.strain.calories,
              woreDevice: dayData.woreDevice, fetchStatus: 'READY', fetchedAt: new Date(),
            },
            update: {
              recoveryScore: dayData.recovery.recoveryScore, hrv: dayData.recovery.hrv,
              rhr: dayData.recovery.rhr, spo2: dayData.recovery.spo2,
              sleepDuration: dayData.sleep.durationMinutes, sleepPerf: dayData.sleep.performancePct,
              sleepEfficiency: dayData.sleep.efficiencyPct, remMinutes: dayData.sleep.remMinutes,
              deepMinutes: dayData.sleep.deepMinutes, lightMinutes: dayData.sleep.lightMinutes,
              respiratoryRate: dayData.sleep.respiratoryRate,
              strainScore: dayData.strain.strainScore, calories: dayData.strain.calories,
              woreDevice: dayData.woreDevice, fetchStatus: 'READY', fetchedAt: new Date(), deliveredAt: null,
            },
          });

          await deliverBrief(userId, snapshot, bot, whoop);
        } catch (err) {
          console.error('[oauth] first brief delivery failed:', err);
          // Non-critical — user will get their brief tomorrow morning
        }
      });

      res.status(200).send(
        htmlPage(
          'Muvaffaqiyatli!',
          '<h2>✅ Whoop muvaffaqiyatli ulandi!</h2><p>Endi Telegram botga qayting. Har kuni ertalab sog\'liq hisobotingiz yuboriladi.</p>',
        ),
      );
    } catch (err: any) {
      console.error('OAuth token exchange failed:', err?.response?.data ?? err.message);

      try {
        await bot.telegram.sendMessage(
          userId.toString(),
          "Whoop ulashda xatolik yuz berdi. Iltimos, /start buyrug'ini qayta yuboring.",
        );
      } catch {
        // ignore
      }

      res.status(500).send(
        htmlPage('Xatolik', '<h2>❌ Xatolik yuz berdi</h2><p>Iltimos, Telegramga qayting va /start buyrug\'ini qayta yuboring.</p>'),
      );
    }
  });

  return router;
}
