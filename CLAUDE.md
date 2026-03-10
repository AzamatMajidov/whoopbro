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
Webhook integration ✅ — shipped and tested in production.

## Next Action
Phase 2 — AI Insights & Causal Analysis (see PRD section 6b):
- P0: historical data storage schema already exists (dailySnapshot)
- P1: causal daily report block + "Nima uchun?" command
- Start when ready

## Progress
- ✅ Weeks 1–5: Foundation → AI brief → Monetization → VPS/deploy → Webhook delivery
- ✅ Phase 2 P0+P1+P2: All shipped 2026-03-10

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
2026-03-10
