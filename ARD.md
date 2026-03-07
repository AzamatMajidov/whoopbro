# WhoopBro — Architecture Review Document

**Version:** 2.0  
**Date:** 2026-03-07  
**Status:** Draft  
**Model used for review:** Claude Opus 4.6

---

## 1. System Overview

```
User (Telegram)
      │
      ▼
 Telegraf Bot (webhook)
      │
  ┌───┴────────────────────────┐
  │                            │
  ▼                            ▼
Command Handlers          Callback Handlers
(/start, /settings,       (inline buttons,
 /uz, /ru, /disconnect)    on-demand queries)
      │                            │
      └──────────────┬─────────────┘
                     ▼
              Access Middleware
              (subscription check)
                     │
              Core Services
      ┌──────────────────────────┐
      │  WhoopService            │  ← API client + token mgmt
      │  BriefGenerator          │  ← data → brief composer
      │  AIService               │  ← Gemini 3.1 Flash Lite
      │  SubscriptionService     │  ← trial/paid logic
      │  NotificationService     │  ← delivery + retry
      └──────────────┬───────────┘
                     ▼
              PostgreSQL (Prisma)
                     
Express OAuth Server (port 3001)
  GET /whoop/callback  ← Whoop OAuth redirect

node-cron Scheduler
  ├── 05:30 — pre-fetch sweep
  ├── 05:30–10:00 — smart retry loop
  ├── per-user brief time — delivery
  └── Sunday 21:00 — weekly summary
```

---

## 2. Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Runtime | Node.js 22 + TypeScript | Consistent with other projects |
| Bot framework | Telegraf v4 | Proven, solid middleware support |
| AI model | Gemini 3.1 Flash Lite | Cheapest, fastest, strong Uzbek output |
| Database | PostgreSQL | Relational, reliable, easy to query |
| ORM | Prisma | Type-safe, migrations built-in |
| Scheduler | node-cron | Simple, timezone-aware |
| HTTP client | axios | Whoop API calls with interceptors |
| OAuth server | Express (minimal) | Single-route callback handler |
| Hosting | Hetzner VPS (CX22) | Already running babycars-bot |
| Process manager | systemd user service | Consistent with other bots |
| Encryption | Node.js `crypto` (AES-256-GCM) | Token encryption at rest |

---

## 3. Whoop OAuth 2.0 Flow

Whoop uses **OAuth 2.0 Authorization Code** with offline access.

### 3.1 Happy Path
```
1. User sends /start
2. Bot checks if already connected → if yes, skip to onboarding complete
3. Bot generates state = crypto.randomUUID(), stores in oauth_states with TTL 10min
4. Bot sends OAuth URL:
   https://api.prod.whoop.com/oauth/oauth2/auth
     ?client_id=CLIENT_ID
     &redirect_uri=https://<domain>/whoop/callback
     &scope=read:recovery read:sleep read:workout read:body_measurement offline
     &response_type=code
     &state=<uuid>
5. User taps link → authorizes on Whoop website
6. Whoop redirects to our callback: GET /whoop/callback?code=XXX&state=UUID
7. Server validates state (exists + not expired), deletes it
8. Exchange code → POST /oauth/oauth2/token → access_token + refresh_token + expires_in
9. Encrypt tokens, store in whoop_tokens table
10. Mark user as connected, start 14-day trial
11. Send Telegram message: "✅ Whoop ulandi! Ertaga ertalab birinchi hisobotingizni olasiz."
```

### 3.2 Edge Cases — OAuth

| Case | Handling |
|---|---|
| User clicks link but never authorizes | State expires in 10min — no action. User can /start again. |
| User clicks link twice (opens two OAuth windows) | Only one state per user stored (upsert). First completion wins. |
| State not found (expired or tampered) | Return 400 page: "Havola muddati o'tgan. /start buyrug'ini qayta yuboring." |
| Code exchange fails (network error) | Retry once after 2s. If still fails: send Telegram message to retry /start. |
| User already connected and runs /start | Show current status + option to reconnect (disconnect old tokens first) |
| Whoop returns error in callback (user denied) | Detect `?error=access_denied`, send friendly message explaining they can try again |
| Multiple /start before OAuth complete | Upsert state — only latest counts. Idempotent. |

### 3.3 Token Management

```typescript
// Before every API call:
async function getValidToken(userId: bigint): Promise<string> {
  const token = await db.whoopTokens.findUnique({ where: { userId } });
  
  if (!token) throw new WhoopNotConnectedError();
  
  // Refresh if expires within 5 minutes
  if (token.expiresAt < new Date(Date.now() + 5 * 60 * 1000)) {
    return await refreshToken(userId, token.refreshToken);
  }
  
  return decrypt(token.accessToken);
}
```

**Token refresh edge cases:**

| Case | Handling |
|---|---|
| Refresh token expired (Whoop revokes after 30 days inactive) | Catch 401, mark user as disconnected, send reconnect prompt |
| Refresh call fails (network) | Retry 3x with exponential backoff. If all fail: skip today's brief, notify user |
| Race condition (two refresh calls simultaneously) | DB-level upsert with `updatedAt` check — only latest wins |
| User revokes access from Whoop app | Same as expired refresh: catch 401 on any API call, notify user |

### 3.4 OAuth Callback Server

- Express server on port 3001
- Only one route: `GET /whoop/callback`
- HTTPS required by Whoop → Let's Encrypt via certbot
- Rate limit: 10 req/min per IP (prevent abuse)
- Timeout: 30s (if Telegram notification fails, still return success page to user)

---

## 4. Whoop API Data Fetching

### 4.1 Endpoints

```
GET /v1/recovery?start={date}&end={date}     → recovery score, HRV, RHR, SpO2
GET /v1/sleep?start={date}&end={date}        → sleep record (duration, stages, efficiency)
GET /v1/cycle?start={date}&end={date}        → day strain + calories
GET /v1/workout?start={date}&end={date}      → recent workouts (last 7 days for trends)
GET /v1/user/measurement                     → height, weight (fetched once, cached)
```

### 4.2 Smart Fetch Strategy (Key Design)

**Problem:** Whoop calculates recovery only AFTER sleep ends. If user wakes at 08:30, recovery data doesn't exist at 06:00 pre-fetch.

**Solution: Adaptive retry loop**

```
05:30 — Initial sweep: attempt fetch for all users
        → Data available? Mark as READY, schedule brief for user's set time
        → No data? Mark as PENDING

05:30–10:00 — Retry loop (every 30 min):
        → Fetch PENDING users only
        → Data available? Mark READY, deliver brief immediately
        → Still no data at 10:00? → STALE fallback

10:00 — STALE fallback:
        → Use yesterday's data + note: "Bugungi ma'lumot hali tayyor emas.
          Kechagi ko'rsatkichlar asosida tavsiyalar:"
        → Mark snapshot as stale=true

```

**Per-user brief_time setting:**
- If user's brief_time = 09:00 and data arrives at 08:30 → brief sends at 09:00 ✅
- If user's brief_time = 07:00 and data arrives at 08:30 → brief sends immediately at 08:30 (late delivery, better than nothing)
- Late delivery includes note: "Kechirasiz, ma'lumot kech tayyor bo'ldi 🙏"

### 4.3 Fetch State Machine

```
PENDING → FETCHING → READY → DELIVERED
              ↓
           FAILED → retry (max 8 attempts until 10:00)
              ↓
           STALE (fallback with yesterday's data)
```

Stored in `daily_snapshots.fetch_status` field.

### 4.4 Additional Edge Cases — Fetching

| Case | Handling |
|---|---|
| User didn't wear Whoop last night | API returns empty sleep record. Brief notes: "Kecha Whoop kiyilmagan. Umumiy tavsiyalar:" → give generic recovery advice |
| User napped (multiple sleep records) | Use the longest/latest sleep record as primary |
| Whoop API is down (5xx) | Exponential backoff: 2min, 4min, 8min. After 3 failures: notify user "Whoop serverlari hozir ishlamayapti, kechroq urinib ko'ramiz" |
| API rate limit hit | Whoop limit: ~100 req/min. At 200 users, batch fetches with 500ms delay between users. Well within limits. |
| Network timeout | axios timeout: 10s. Retry counts as failed attempt. |
| Partial data (recovery exists, sleep missing) | Generate brief with available data, note missing fields |
| User in different timezone | Brief delivered at user's set time in Tashkent tz (all times stored as Tashkent) |

### 4.5 Daily Snapshot Schema

```sql
daily_snapshots
  user_id            BIGINT
  date               DATE
  -- Recovery
  recovery_score     INT              -- null if not available
  hrv                FLOAT
  rhr                FLOAT
  spo2               FLOAT
  -- Sleep
  sleep_duration     INT              -- minutes
  sleep_perf         FLOAT
  sleep_efficiency   FLOAT
  rem_minutes        INT
  deep_minutes       INT
  light_minutes      INT
  respiratory_rate   FLOAT
  -- Strain
  strain_score       FLOAT
  calories           INT
  -- Fetch metadata
  fetch_status       TEXT             -- PENDING|FETCHING|READY|STALE|FAILED
  fetch_attempts     INT DEFAULT 0
  is_stale           BOOLEAN DEFAULT false  -- true = used yesterday's data
  whoop_wore_device  BOOLEAN DEFAULT true
  raw_json           JSONB
  fetched_at         TIMESTAMP
  delivered_at       TIMESTAMP
  PRIMARY KEY (user_id, date)
```

---

## 5. AI Pipeline

### 5.1 Model
- **Gemini 3.1 Flash Lite** via `@google/generative-ai`
- Fast, cheap, strong multilingual (Uzbek/Russian)
- Fallback: if Gemini fails → **Gemini 2.0 Flash** (same API, slightly more expensive but reliable)

### 5.2 Prompt Architecture

```
SYSTEM PROMPT (static, cached):
  Sen WhoopBro — foydalanuvchining shaxsiy sport va sog'liq murabbiyisan.
  Ilmiy asoslangan, tekshirilgan tavsiyalar berasan.
  Uslub: rasmiy (siz), issiq, do'stona — ayblamaysiz, bosimli emas.
  Tibbiy maslahat BERMA. Har javob oxirida qo'sh: "⚠️ Bu tibbiy maslahat emas."
  Javobni 4 qismga bo'l:
  1. Tiklanish holati (2 jumla)
  2. Uyqu tahlili (2 jumla)
  3. Bugungi tavsiya — mashq intensivligi + 2-3 aniq taklif
  4. Motivatsion xulosa (1 jumla)

USER DATA PROMPT (dynamic):
  Foydalanuvchi: {first_name}
  Sana: {date}
  Til: {language}
  
  Bugungi ko'rsatkichlar:
  - Tiklanish: {recovery}% (7 kunlik o'rtacha: {avg_recovery}%, farq: {delta}%)
  - HRV: {hrv}ms (o'rtacha: {avg_hrv}ms, farq: {hrv_delta}%)
  - RHR: {rhr} urib/min (o'rtacha: {avg_rhr}, farq: {rhr_delta}%)
  - SpO2: {spo2}%
  - Nafas tezligi: {resp_rate} nafas/min
  
  Uyqu:
  - Davomiylik: {sleep_h}soat {sleep_m}daqiqa
  - Samaradorlik: {sleep_perf}%
  - REM: {rem}daqiqa | Chuqur: {deep}daqiqa | Yengil: {light}daqiqa
  
  Bugungi zo'riqish (kecha): {strain}/21
  So'nggi 7 kun: {7d_strain_summary}
  
  Ilmiy qoidalar (qat'iy amal qil):
  {recommendation_rules_json}
  
  {stale_notice_if_applicable}
```

### 5.3 Recommendation Rules (injected as JSON)

```json
{
  "recovery": {
    "green": { "threshold": 67, "intensity": "Og'ir mashq — PR sinoviga tayyor" },
    "yellow": { "range": [34, 66], "intensity": "O'rtacha intensivlik — PR sinovi emas" },
    "red": { "threshold": 33, "intensity": "Faol dam olish yoki to'liq dam" }
  },
  "hrv_drop": {
    "threshold_pct": -20,
    "action": "Intensivlikni kamaytiring, uyquga ustuvorlik bering"
  },
  "rhr_spike": {
    "threshold_pct": 5,
    "action": "Dam olish kuni tavsiya etiladi — kasallik/stress belgisi"
  },
  "sleep": {
    "short": { "threshold_min": 360, "action": "Iloji bo'lsa kun davomida uxlang" },
    "low_rem": { "threshold_min": 90, "action": "Kechqurun ekrandan uzoqlashing, 14:00 dan keyin kofein emas" },
    "low_deep": { "threshold_min": 60, "action": "Xona haroratini pasaytiring, ertaroq yoting" }
  },
  "resp_rate_spike": {
    "threshold_pct": 10,
    "action": "Kasallik belgisi bo'lishi mumkin — zo'riqishni kamaytiring, kuzating"
  }
}
```

### 5.4 AI Edge Cases

| Case | Handling |
|---|---|
| Gemini API timeout (>15s) | Cancel request, use pre-written template brief with raw numbers |
| Gemini returns garbled Uzbek | Language validation: if output contains <30% Uzbek chars → retry once with stronger language instruction |
| Gemini refuses (safety filter) | Catch refusal response, fallback to template brief |
| Stale data brief | Prepend note in prompt: "Bu kechagi ma'lumot. Bugungi ma'lumot vaqtida kelmadi." |
| User has no 7-day history (new user) | Skip trend comparisons, generate brief without delta percentages |
| Missing partial data | Skip missing fields in prompt, don't hallucinate values |

### 5.5 Cost Estimate

- Input tokens per brief: ~1,200 (data + rules + system prompt)
- Output tokens per brief: ~450
- Cost per brief: $0.25/1M × 1.2k + $1.50/1M × 0.45k = $0.0003 + $0.00068 = **~$0.001**
- 200 users × 30 days = 6,000 briefs/month = **~$6/month AI cost**
- On-demand queries: ~50/day avg × $0.001 = **~$1.5/month extra**
- **Total AI cost at 200 users: ~$7.5/month**

---

## 6. Database Schema (Full)

```prisma
model User {
  id              BigInt        @id              // Telegram user ID
  username        String?
  firstName       String?
  language        String        @default("uz")   // "uz" | "ru"
  briefTime       String        @default("07:00") // HH:MM Tashkent
  whoopConnected  Boolean       @default(false)
  whoopUserId     String?
  createdAt       DateTime      @default(now())
  lastActiveAt    DateTime      @default(now())

  tokens          WhoopToken?
  subscription    Subscription?
  snapshots       DailySnapshot[]
  oauthStates     OAuthState[]
}

model WhoopToken {
  userId          BigInt        @id
  accessToken     String        // AES-256-GCM encrypted
  refreshToken    String        // AES-256-GCM encrypted
  expiresAt       DateTime
  updatedAt       DateTime      @updatedAt
  user            User          @relation(fields: [userId], references: [id])
}

model OAuthState {
  state           String        @id   // UUID
  userId          BigInt
  createdAt       DateTime      @default(now())
  expiresAt       DateTime      // createdAt + 10min
  user            User          @relation(fields: [userId], references: [id])
}

model Subscription {
  userId          BigInt        @id
  status          String        // "trial" | "active" | "expired"
  trialStart      DateTime
  trialEnd        DateTime      // trialStart + 14 days
  paidUntil       DateTime?
  paymentRef      String?       // Payment reference (manual note, Click order ID, etc.)
  updatedAt       DateTime      @updatedAt
  user            User          @relation(fields: [userId], references: [id])
}

model DailySnapshot {
  userId          BigInt
  date            DateTime      @db.Date
  // Recovery
  recoveryScore   Int?
  hrv             Float?
  rhr             Float?
  spo2            Float?
  // Sleep
  sleepDuration   Int?          // minutes
  sleepPerf       Float?
  sleepEfficiency Float?
  remMinutes      Int?
  deepMinutes     Int?
  lightMinutes    Int?
  respiratoryRate Float?
  // Strain
  strainScore     Float?
  calories        Int?
  // Fetch state machine
  fetchStatus     String        @default("PENDING") // PENDING|FETCHING|READY|STALE|FAILED
  fetchAttempts   Int           @default(0)
  isStale         Boolean       @default(false)
  woреDevice      Boolean       @default(true)
  // Metadata
  rawJson         Json?
  fetchedAt       DateTime?
  deliveredAt     DateTime?

  @@id([userId, date])
  user            User          @relation(fields: [userId], references: [id])
}
```

---

## 7. Subscription & Paywall

### 7.1 Trial Logic

```
Day 0 (connect):   Trial starts. Full access. Welcome message.
Day 12 (warning):  "Sinovdan 2 kun qoldi. To'liq kirish uchun obuna bo'ling."
Day 13 (warning):  "Sinovdan 1 kun qoldi."  [Obuna bo'lish] button
Day 14+ (expired): Brief blocked. Show recovery score only.
                   Paywall message + [Obuna bo'lish] button
```

### 7.2 Paywall Message (expired)
```
🔒 Sinovingiz tugadi.

Bugungi tiklanish: {recovery}% {emoji}

To'liq hisobot, AI maslahat va haftalik tahlil uchun
obuna bo'ling — oyiga atigi 400 ⭐

[💳 Obuna bo'lish — 400 ⭐/oy]
```

### 7.3 Payment Flow (Phase 1 — Manual P2P)

```
User taps [💳 Obuna bo'lish]
  → Bot shows Click card number + [✅ To'ladim] button
  → User pays via Click, taps To'ladim
  → Admin (userId 45118778) receives Telegram notification:
       "💰 Yangi to'lov so'rovi — {name} {userId}"
       [✅ Faollashtirish] [❌ Rad etish]
  → Admin taps Faollashtirish:
       subscription.status = 'active'
       subscription.paidUntil = NOW() + 30 days
       subscription.paymentRef = 'manual-p2p'
  → User notified + immediate brief if missed today
```

**Phase 2 (50+ users):** Click/Payme merchant API webhook replaces admin button — same `activatePaid()` call, triggered automatically.

**Phase 3 (international, $8-10+/month):** Polar.sh or Stripe.

### 7.4 Payment Edge Cases

| Case | Handling |
|---|---|
| User pays but admin doesn't confirm | User can re-tap To'ladim; admin gets another notification |
| User pays but DB update fails | Log failed update, retry 3x. Alert admin. |
| User pays multiple times | Second activation extends paidUntil by 30 more days (additive) |
| Admin rejects by mistake | `/admin activate {userId}` command as manual override |

### 7.5 Access Check

```typescript
async function hasAccess(userId: bigint): Promise<boolean> {
  const sub = await db.subscription.findUnique({ where: { userId } });
  if (!sub) return false;
  
  const now = new Date();
  if (sub.status === 'trial' && now < sub.trialEnd) return true;
  if (sub.status === 'active' && sub.paidUntil && now < sub.paidUntil) return true;
  
  // Auto-expire
  if (sub.status !== 'expired') {
    await db.subscription.update({
      where: { userId },
      data: { status: 'expired' }
    });
  }
  return false;
}
```

---

## 8. Bot Architecture

### 8.1 Middleware Chain

```
Telegraf
  → logMiddleware (request logging)
  → userMiddleware (upsert user, update lastActiveAt)
  → languageMiddleware (load user's language pref into ctx)
  → [route to handler]
  → [if brief/query route]: accessMiddleware (subscription check)
```

### 8.2 File Structure

```
src/
  bot/
    index.ts              — Telegraf init, middleware registration, webhook
    handlers/
      start.ts            — /start + onboarding flow
      settings.ts         — /settings, /uz, /ru, /disconnect, brief time setup
      callbacks.ts        — inline button callbacks (whoop_full, subscribe, etc.)
      messages.ts         — free-text → on-demand AI query
      payment.ts          — pre_checkout_query + successful_payment
  services/
    whoop.ts              — Whoop API client (getValidToken, fetchDayData, refreshToken)
    ai.ts                 — Gemini client, prompt builder, language validator
    brief.ts              — brief composer (3 blocks → Telegram message formatter)
    subscription.ts       — hasAccess, startTrial, handlePayment
    notification.ts       — sendBrief, sendWarning, sendPaywall
  scheduler/
    index.ts              — register all cron jobs
    prefetch.ts           — 05:30 sweep + adaptive retry loop
    deliver.ts            — brief delivery per user at their set time
    weekly.ts             — Sunday 21:00 weekly summary
    maintenance.ts        — cleanup expired oauth_states, old snapshots
  db/
    client.ts             — Prisma singleton
  oauth/
    server.ts             — Express app (port 3001)
    handler.ts            — /whoop/callback → token exchange → notify user
  utils/
    crypto.ts             — AES-256-GCM encrypt/decrypt for tokens
    retry.ts              — exponential backoff helper
    logger.ts             — structured logging
  config/
    index.ts              — env vars validation (zod), constants
  types/
    whoop.ts              — Whoop API response types
    brief.ts              — brief data types
prisma/
  schema.prisma
  migrations/
.env
```

### 8.3 On-Demand Query Handler

```
User sends message → messages.ts
  → accessMiddleware (check subscription)
  → Fetch today's snapshot from DB (if READY)
  → If no snapshot: fetch live from Whoop API
  → Build AI prompt with user question + health data context
  → Stream or await Gemini response
  → Reply to user
  
Rate limit: 10 on-demand queries/day per user (pro tier)
```

---

## 9. Cron Schedule

| Time (Tashkent) | Job | Notes |
|---|---|---|
| 05:30 | Pre-fetch sweep | Attempt all connected users |
| 06:00 | Retry #1 | PENDING users only |
| 06:30 | Retry #2 | |
| 07:00 | Retry #3 + deliver early birds | Users with brief_time=07:00 if READY |
| 07:30 | Retry #4 | |
| 08:00 | Retry #5 + deliver | Users with brief_time=08:00 |
| 08:30 | Retry #6 | |
| 09:00 | Retry #7 + deliver | Users with brief_time=09:00 |
| 09:30 | Retry #8 | |
| 10:00 | Final retry + STALE fallback | Deliver with yesterday's data if still no data |
| 02:00 | Cleanup | Delete expired oauth_states, snapshots >90 days |
| Sunday 21:00 | Weekly summary | All active subscribers |

---

## 10. Infrastructure

### 10.1 VPS Setup
- **Server:** Hetzner CX22 (same as babycars-bot)
- **Domain:** Need a domain for Let's Encrypt (e.g. `whoopbro.uz` or subdomain)
- **Ports:** 443 (HTTPS for OAuth callback), 3001 (internal OAuth Express server behind nginx)
- **Nginx:** Reverse proxy 443 → 3001, Let's Encrypt cert

### 10.2 Nginx Config (sketch)
```nginx
server {
  listen 443 ssl;
  server_name whoopbro.uz;
  
  ssl_certificate /etc/letsencrypt/live/whoopbro.uz/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/whoopbro.uz/privkey.pem;
  
  location /whoop/callback {
    proxy_pass http://localhost:3001;
  }
}
```

### 10.3 Systemd Service
```ini
[Unit]
Description=WhoopBro Telegram Bot
After=network.target postgresql.service

[Service]
Type=simple
WorkingDirectory=/home/azamat/Projects/whoopbro
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
EnvironmentFile=/home/azamat/Projects/whoopbro/.env

[Install]
WantedBy=default.target
```

### 10.4 Environment Variables
```env
BOT_TOKEN=
WHOOP_CLIENT_ID=
WHOOP_CLIENT_SECRET=
WHOOP_REDIRECT_URI=https://whoopbro.uz/whoop/callback
GEMINI_API_KEY=
DATABASE_URL=postgresql://whoopbro:password@localhost:5432/whoopbro
ENCRYPTION_KEY=          # 32-byte hex, for AES-256-GCM
WEBHOOK_SECRET=          # Telegram webhook secret token
PORT=3001
NODE_ENV=production
```

---

## 11. Security

| Concern | Mitigation |
|---|---|
| Token theft from DB | AES-256-GCM encryption at rest. Key stored only in env var, not DB. |
| CSRF on OAuth callback | State token (UUID) validated server-side, single-use, 10min TTL |
| Replay attack on callback | State deleted immediately after first use |
| Rate abuse on OAuth server | 10 req/min per IP via express-rate-limit |
| Telegram webhook spoofing | `secretToken` header validation on every webhook call |
| Sensitive data in logs | Never log access_token, refresh_token, user health data |
| SQL injection | Prisma ORM — parameterized queries only |
| Medical liability | "⚠️ Bu tibbiy maslahat emas" appended to every AI output |
| GDPR/data privacy | `/disconnect` deletes all tokens + snapshots. User can wipe their data. |

---

## 12. Failure Modes & Recovery

| Failure | Detection | Recovery |
|---|---|---|
| Bot crashes | systemd Restart=always | Auto-restart in 10s |
| DB connection lost | Prisma throws | Retry 3x, alert admin via Telegram |
| Gemini API down | 5xx response | Fallback to template brief |
| Whoop API down | 5xx response | Retry with backoff, deliver stale if persistent |
| VPS restart | systemd WantedBy=default | Auto-start on boot |
| Missed brief (bot was down) | Check deliveredAt=null on startup | Deliver any undelivered briefs on startup |
| Cron job skipped | Verify via startup check | Re-run missed jobs on startup if within same day |

---

## 13. Resolved Decisions

- [x] **Domain:** `whoopbro.uz` — available, register at ahost.uz (~27,000 UZS/year)
- [x] **Whoop developer account:** Register at developer.whoop.com (Azamat has active device + membership)
- [x] **Telegram Stars price:** 400 Stars/month (~$4)
- [x] **Admin alerting:** Telegram user `45118778` (Azamat)
- [x] **Data retention:** 90 days for daily snapshots
- [x] **On-demand query limit:** 10/day for pro users
