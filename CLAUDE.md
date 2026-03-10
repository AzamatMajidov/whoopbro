# CLAUDE.md — WhoopBro

## Status
active — live on production ✅

## What this is
Whoop wearable → daily AI health coaching in Uzbek/Russian via Telegram bot.

## Stack
Node.js 22 + TypeScript + Telegraf + Prisma + PostgreSQL + Gemini 2.0 Flash Lite

## Repo & Deploy
- **Repo:** github.com/AzamatMajidov/whoopbro
- **Local:** ~/Projects/whoopbro/
- **Deploy:** VPS 204.168.152.172 · systemd: `whoopbro`
- **Bot:** @whoopbro_bot
- **Domain:** whoopbro.uz (registered at ahost.uz, DNS activates ~Tue Mar 10)

## Current Task
Webhook integration (T26) — event-driven pipeline replacing cron-based prefetch.

## Next Action
Implement webhook infrastructure:
1. Prisma schema migration — add `WebhookEvent` model + 3 fields on `DailySnapshot`
2. `src/webhook/router.ts` — POST /webhook/whoop, HMAC-SHA256 signature validation, 200 OK fast
3. `src/webhook/handlers.ts` — recovery.updated → deliverBrief, workout.updated → evening warning
4. Remove prefetch sweep + retry loops from scheduler (keep 10:00 stale fallback)
5. Commit, push, deploy to VPS + restart systemd

## Progress
- ✅ Week 1 (T1–T6): Foundation, DB schema, OAuth, Express server, WhoopService
- ✅ Week 2 (T7–T13): AI brief, scheduler, delivery, on-demand queries, weekly summary
- ✅ Week 3 (T14–T18): Subscriptions, trial warnings, p2p payment flow, admin panel, settings
- ⬜ Week 4 (T19–T25): VPS/HTTPS/nginx, systemd, startup recovery, admin alerts, E2E test, launch
- ⬜ Week 5 (T26): Whoop webhook integration (post-launch)

## Key Decisions
- Price: 50,000 UZS/month (~$4) · 14-day free trial
- Payment Phase 1: manual p2p Click/Payme card → admin confirms via Telegram button
- Token encryption: AES-256-GCM stored in DB
- Stale fallback: if no data by 10:00, use yesterday's with notice
- On-demand queries: 10/day limit for pro users
- Data retention: 90 days

## Gotchas
- OAuth state expires in 10 min — don't let users sit on the link too long
- Whoop API can be slow — retry up to 8x before stale fallback
- cctld.uz domains are slow to activate (hence the wait)
- Brief delivery: check `deliveredAt IS NULL` before sending — avoid duplicates on restart
- Admin Telegram ID: 45118778

## Last Updated
2026-03-08
