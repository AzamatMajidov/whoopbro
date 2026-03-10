# CLAUDE.md — WhoopBro

## Status
**Active — live on production ✅**
VPS: 204.168.152.172 · Bot: @whoopbro_bot · Domain: whoopbro.uz

## What it does
Whoop wearable → daily AI health brief in Uzbek or Russian via Telegram.
Webhook-driven: `recovery.updated` → fetch data → generate brief → send.

## Current Task
Internal testing with 4 friends (started 2026-03-10).

## Next Action
Collect tester feedback → decide Phase 3 scope (conversational Q&A, journal prompting, admin analytics).

---

## Architecture

### Data flow
```
Whoop webhook → webhook/handlers.ts
  → WhoopService (fetch full day data)
  → DailySnapshot upsert (Prisma)
  → deliverBrief() → generateBrief() (Gemini) → composeBrief() → Telegram
```

### Key cron jobs (Asia/Tashkent)
| Time | Job | File |
|---|---|---|
| Every minute | deliver briefs (match user briefTime) | scheduler/deliver.ts |
| 10:00 | stale fallback (missed webhooks) | scheduler/prefetch.ts |
| 10:00 | pattern detection scan | scheduler/patterns.ts |
| 09:00 | trial warnings + expiry reminders | scheduler/maintenance.ts |
| Sunday 21:00 | weekly summary | scheduler/weekly.ts |

---

## File Map

### Core services
- `src/services/whoop.ts` — Whoop API client (fetchDayData, backfillHistory, token refresh)
- `src/services/ai.ts` — Gemini prompts (generateBrief, generateCausalBlock, generateWhyNotResponse, buildAnomalyFlags)
- `src/services/brief.ts` — message composition (composeBrief, composePaywall, defaultKeyboard)
- `src/services/patterns.ts` — pattern detection logic (detectAndNotify, 3 pattern types)
- `src/services/subscription.ts` — trial/active access checks

### Bot handlers
- `src/bot/handlers/messages.ts` — text messages + all callback_query handlers (detail, ask, whynot)
- `src/bot/handlers/start.ts` — /start command, onboarding flow
- `src/bot/handlers/settings.ts` — /settings, briefTime, language, disconnect
- `src/bot/handlers/payment.ts` — /subscribe, admin payment confirmation

### Scheduler
- `src/scheduler/deliver.ts` — `deliverBrief()` (main delivery fn), `checkAndDeliverBriefs()` (cron)
- `src/scheduler/prefetch.ts` — stale fallback, `snapshotFromDayData()`
- `src/scheduler/weekly.ts` — narrative weekly summary with trend + active patterns
- `src/scheduler/patterns.ts` — pattern cron runner
- `src/scheduler/maintenance.ts` — trial/expiry notifications

### Infrastructure
- `src/oauth/handler.ts` — Whoop OAuth callback (token exchange, backfill trigger)
- `src/webhook/handlers.ts` — `recovery.updated`, `workout.updated` event handlers
- `src/webhook/router.ts` — Express webhook route + HMAC validation
- `src/db/client.ts` — Prisma singleton (`db`)
- `src/utils/crypto.ts` — AES-256-GCM encrypt/decrypt for tokens ⚠️ DO NOT TOUCH
- `src/i18n/index.ts` — all UI strings for uz/ru

---

## Key Conventions

### Language / i18n
- `lang` is always `"uz" | "ru"` (type `Lang`)
- Get lang: `await getUserLang(userId)` or `user.language === 'ru' ? 'ru' : 'uz'`
- All UI strings go in `src/i18n/index.ts` — never hardcode user-visible text

### AI prompts
- All system prompts written in **English** — better LLM instruction-following
- Output language injected dynamically: `OUTPUT LANGUAGE: ${lang === 'ru' ? 'Russian' : 'Uzbek (conversational)'}`
- Primary model: `gemini-3.1-flash-lite-preview` | Fallback: `gemini-2.5-flash`
- Always add a timeout (8–15s) + catch — never let AI failures block delivery

### DB access
- Use `db` singleton from `src/db/client.ts` — never create new PrismaClient
- DailySnapshot keyed by `{ userId, date }` — date is always `new Date('YYYY-MM-DDT00:00:00Z')`
- Tashkent today: `new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' })`

### Error handling
- Webhook handlers: always swallow errors per-user — one failure must not affect others
- Scheduler jobs: wrapped in `safeRun()` — never throw from cron
- AI calls: always `try/catch` + fallback message — never block delivery

---

## DO NOT touch
- `src/utils/crypto.ts` — token encryption, changing breaks all stored tokens
- `deliveredAt IS NULL` check in deliver.ts — prevents duplicate briefs on restart
- Webhook deduplication via `traceId` in WebhookEvent table
- Admin Telegram ID: `45118778`

---

## Dev Commands
```bash
npm run dev          # local dev (tsx watch)
npm run build        # tsc compile
npx tsc --noEmit     # type-check only
npx prisma migrate dev --name <name>   # new migration
npx prisma generate  # regenerate client after schema change
```

### VPS ops
```bash
ssh root@204.168.152.172
cd /opt/whoopbro
git pull && npm run build && systemctl restart whoopbro
journalctl -u whoopbro -f --no-pager   # live logs
```

---

## Key Decisions
- Price: 50,000 UZS/month · 14-day free trial (no card needed)
- Payment: manual p2p Click card → admin confirms via Telegram button
- Token storage: AES-256-GCM encrypted in DB (not in env)
- Stale fallback: if no webhook by 10:00 → fetch yesterday's data with `[stale]` notice
- On-demand queries: 10/day limit per user
- whoopUserId: fetched from `/v1/user/profile/basic` after OAuth (not in token response)

---

## Phase 2 — Shipped 2026-03-10
- ✅ P0: 30-day history backfill on OAuth connect (2 bulk API calls, not 30)
- ✅ P1: "Sabab" causal block in brief + "Nima uchun?" button (14-day history deep-dive)
- ✅ P2: Pattern detection — 3 types, daily cron at 10:00, one-time notification on first confirm
- ✅ P2: Enhanced weekly summary — narrative AI story, recovery trend, active patterns

---

## Last Updated
2026-03-10
