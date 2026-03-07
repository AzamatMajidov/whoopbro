# WhoopBro — Development Task List

**Last updated:** 2026-03-07  
**Target launch:** 4 weeks from kickoff  
**Stack:** Node.js 22 + TypeScript + Telegraf + Prisma + PostgreSQL + Gemini

---

## 🏗 Week 1 — Foundation

### T1 — Repo Init & Project Scaffold
**Goal:** Working TypeScript project with all dependencies installed and configured.

**Steps:**
1. `mkdir ~/Projects/whoopbro && cd ~/Projects/whoopbro`
2. `git init && npm init -y`
3. Install deps:
   ```
   npm i telegraf @prisma/client axios express @google/generative-ai zod dotenv node-cron
   npm i -D typescript ts-node @types/node @types/express nodemon prisma tsx
   ```
4. `tsconfig.json` — strict mode, target ES2022, outDir: `dist/`
5. `prisma init` — configure `DATABASE_URL` in `.env`
6. `.gitignore` — node_modules, dist, .env, *.db
7. `package.json` scripts:
   - `dev`: `tsx watch src/index.ts`
   - `build`: `tsc`
   - `start`: `node dist/index.ts`
   - `db:migrate`: `prisma migrate dev`
   - `db:generate`: `prisma generate`
8. Create base `src/index.ts` that just starts bot + logs "WhoopBro starting..."
9. Create `.env.example` with all required vars (see ARD §10.4)
10. Initial commit + push to GitHub (private repo: `AzamatMajidov/whoopbro`)

**Done when:** `npm run dev` starts without errors, repo is on GitHub.

---

### T2 — Prisma Schema + DB Migrations
**Goal:** Full DB schema matching ARD §6, migrations applied, Prisma client generated.

**Steps:**
1. Write `prisma/schema.prisma` with all models:
   - `User` (id BigInt, username, firstName, language, briefTime, whoopConnected, whoopUserId, createdAt, lastActiveAt)
   - `WhoopToken` (userId, accessToken encrypted, refreshToken encrypted, expiresAt, updatedAt)
   - `OAuthState` (state UUID, userId, createdAt, expiresAt)
   - `Subscription` (userId, status: trial/active/expired, trialStart, trialEnd, paidUntil, paymentRef, updatedAt)
   - `DailySnapshot` (composite PK: userId+date, all health fields, fetchStatus, fetchAttempts, isStale, woreDevice, rawJson, fetchedAt, deliveredAt)
2. `prisma migrate dev --name init`
3. `prisma generate`
4. Create `src/db/client.ts` — Prisma singleton (one instance, reuse across app)
5. Test: write a quick script that inserts a test user and reads it back

**Done when:** All tables exist in DB, Prisma client is typed and importable.

---

### T3 — `/start` Command + OAuth Link Generation
**Goal:** User sends `/start`, bot explains value prop and sends OAuth link with state.

**Steps:**
1. Create `src/bot/handlers/start.ts`
2. On `/start`:
   - Upsert user in DB (create if new, update lastActiveAt)
   - Check if already Whoop-connected → if yes, send "already connected" message with `/settings` hint
   - Generate `state = crypto.randomUUID()`
   - Store in `oauth_states`: `{ state, userId, expiresAt: now + 10min }`
   - Build OAuth URL:
     ```
     https://api.prod.whoop.com/oauth/oauth2/auth
       ?client_id=${WHOOP_CLIENT_ID}
       &redirect_uri=${WHOOP_REDIRECT_URI}
       &scope=read:recovery read:sleep read:workout read:body_measurement offline
       &response_type=code
       &state=${state}
     ```
   - Send welcome message in Uzbek with:
     - Value prop (2-3 sentences)
     - `[🔗 Whoop Hisobimni Ulash]` button (login URL button with OAuth link)
3. Handle edge cases (see ARD §3.2): already connected, multiple /start calls (upsert state)
4. Uzbek copy for welcome message (write it properly, don't placeholder)

**Done when:** `/start` sends OAuth link, state is stored in DB with correct TTL.

---

### T4 — Express OAuth Callback Server
**Goal:** Whoop redirects to our server after auth, we exchange code for tokens, encrypt and store, notify user via Telegram.

**Steps:**
1. Create `src/oauth/server.ts` — Express app on port `process.env.PORT || 3001`
2. Create `src/oauth/handler.ts` — `GET /whoop/callback` route:
   - Parse `code` and `state` from query params
   - Detect `?error=access_denied` → send Telegram message to user (need to find userId from state first... tricky — store userId in state)
   - Look up state in DB: not found → 400 HTML page in Uzbek
   - Validate not expired
   - Delete state immediately (single-use)
   - Exchange code: `POST https://api.prod.whoop.com/oauth/oauth2/token` with `grant_type=authorization_code`
   - On success: encrypt access_token + refresh_token (AES-256-GCM, see T5), store in `whoop_tokens`
   - Mark `user.whoopConnected = true`, store `whoopUserId` from token response
   - Start subscription trial: `{ status: 'trial', trialStart: now, trialEnd: now + 14d }`
   - Notify user via Telegram bot: "✅ Whoop ulandi! Ertaga ertalab birinchi hisobotingizni olasiz 🎉"
   - Return success HTML page (simple, in Uzbek: "Ulandi! Telegrama qayting.")
3. Add `express-rate-limit`: 10 req/min per IP
4. Start OAuth server in `src/index.ts` alongside bot
5. Error handling: code exchange fails → retry once after 2s, if still fails → Telegram message to user

**Done when:** Full OAuth flow works end-to-end (tested with ngrok or similar during dev).

---

### T5 — WhoopService + Token Management + Crypto Utils
**Goal:** Reusable service for all Whoop API calls with auto token refresh and encryption.

**Steps:**
1. Create `src/utils/crypto.ts`:
   - `encrypt(text: string): string` — AES-256-GCM, returns `iv:authTag:ciphertext` (all hex)
   - `decrypt(encrypted: string): string` — reverse
   - Key from `process.env.ENCRYPTION_KEY` (32-byte hex)
2. Create `src/utils/retry.ts`:
   - `withRetry(fn, maxAttempts, baseDelayMs)` — exponential backoff helper
3. Create `src/services/whoop.ts`:
   - `getValidToken(userId: bigint): Promise<string>` — check expiry (refresh if within 5min), return decrypted access token
   - `refreshToken(userId: bigint, encryptedRefreshToken: string): Promise<string>` — call token endpoint, update DB, return new access token. Catch 401 → mark user disconnected + notify
   - `fetchRecovery(userId: bigint, date: string)` — `GET /v1/recovery`
   - `fetchSleep(userId: bigint, date: string)` — `GET /v1/sleep`
   - `fetchCycle(userId: bigint, date: string)` — `GET /v1/cycle` (strain + calories)
   - `fetchWorkouts(userId: bigint, startDate: string, endDate: string)` — `GET /v1/workout` (7-day)
   - `fetchDayData(userId: bigint, date: string): Promise<DayData>` — calls all 4 above, merges into `DayData` object
   - All calls: axios with 10s timeout, `getValidToken` before each call
4. Define `DayData` type in `src/types/whoop.ts` — all fields nullable (partial data is valid)
5. Handle Whoop API errors: 5xx → throw `WhoopApiError`, 401 → throw `WhoopTokenExpiredError`

**Done when:** Can call `fetchDayData(userId, '2026-03-07')` and get typed health data back.

---

### T6 — Bot Middleware Chain + Webhook Setup
**Goal:** Clean middleware stack, webhook configured, bot ready for handlers.

**Steps:**
1. Create `src/bot/index.ts` — Telegraf init with webhook or polling (polling for dev, webhook for prod)
2. Create `src/bot/middleware/`:
   - `logger.ts` — log every update (type, userId, text) without sensitive data
   - `user.ts` — upsert user in DB on every message, update lastActiveAt, attach `ctx.dbUser`
   - `language.ts` — load user's language pref into `ctx.lang` ('uz' | 'ru')
   - `access.ts` — `accessMiddleware(ctx, next)` — check subscription, call next or send paywall
3. Register middleware in correct order in `src/bot/index.ts`
4. Register handlers: `/start` (T3), placeholder handlers for `/settings`, `/uz`, `/ru`, `/disconnect`, text messages
5. Webhook: in prod, set webhook to `https://<domain>/bot` (nginx will route this too)
6. Create `src/config/index.ts` — parse all env vars with zod, fail fast on missing required vars
7. Graceful shutdown: handle SIGTERM → stop bot + close DB

**Done when:** Bot responds to messages, middleware runs in order, all env vars validated on startup.

---

## 🤖 Week 2 — Brief Engine

### T7 — AIService (Gemini Integration)
**Goal:** Service that takes health data + user context and returns a formatted Uzbek brief.

**Steps:**
1. Create `src/services/ai.ts`
2. Init `@google/generative-ai` client with `GEMINI_API_KEY`
3. Model: `gemini-2.0-flash-lite` (update model name to whatever is correct at build time)
4. Fallback model: `gemini-2.0-flash` (same API, slightly pricier but reliable)
5. `buildSystemPrompt(language: 'uz' | 'ru'): string` — static system prompt (see ARD §5.2)
6. `buildUserPrompt(data: DayData, user: User, history: DailySnapshot[]): string` — dynamic prompt with all metrics, 7-day averages calculated from history, recommendation rules JSON injected
7. `generateBrief(data: DayData, user: User, history: DailySnapshot[]): Promise<string>` — call Gemini, return text
8. Language validation: count Uzbek-specific chars in output, if <30% → retry once with stronger language instruction
9. Timeout: 15s. On timeout → throw `AITimeoutError` (caught in BriefGenerator → fallback template)
10. Safety filter catch: detect refusal patterns → throw `AIRefusalError` → fallback template
11. Fallback template in `src/services/brief.ts` (T8) — raw numbers, no AI

**Done when:** `generateBrief(mockData, mockUser, [])` returns a coherent Uzbek brief.

---

### T8 — BriefGenerator (Message Formatter)
**Goal:** Compose the 3-block Telegram message from raw health data + AI output.

**Steps:**
1. Create `src/services/brief.ts`
2. `composeBrief(data: DayData, aiText: string, isStale: boolean): TelegramMessage`:
   - Header: date + stale warning if applicable
   - Block 1: Recovery emoji (🟢🟡🔴 based on score) + recovery score + HRV delta + RHR delta + SpO₂
   - Block 2: Sleep duration + performance score + stage breakdown (REM/Deep/Light)
   - Block 3: AI coaching text (the generated content)
   - Footer: "⚠️ Bu tibbiy maslahat emas"
   - Inline keyboard: `[💪 Batafsil] [❓ Savol berish]`
3. `composeFallbackBrief(data: DayData, isStale: boolean): TelegramMessage` — no AI, just raw formatted numbers with static tips based on score thresholds (for Gemini down scenarios)
4. `composeFullDetail(data: DayData): string` — for "Batafsil" button callback, all metrics listed
5. `composePaywall(recoveryScore: number | null): TelegramMessage` — blocked brief with recovery score teaser + subscribe button
6. Handle "didn't wear device" case — special message, no health blocks
7. Handle partial data — skip missing fields, don't show N/A noise

**Done when:** `composeBrief(mockData, mockAiText, false)` returns a nicely formatted Telegram message ready to send.

---

### T9 — Smart Fetch Scheduler (05:30 Sweep + Adaptive Retry)
**Goal:** Every morning, fetch Whoop data for all connected users. Retry until data is available.

**Steps:**
1. Create `src/scheduler/index.ts` — register all cron jobs
2. Create `src/scheduler/prefetch.ts`:
   - `runPrefetchSweep()`:
     - Get all users where `whoopConnected = true`
     - For each: create `DailySnapshot` with `fetchStatus: PENDING` (upsert, skip if already READY/DELIVERED)
     - Call `attemptFetch(userId, date)` for each → update snapshot (READY or FAILED)
   - `attemptFetch(userId, date)`:
     - Update `fetchStatus = FETCHING`, increment `fetchAttempts`
     - Call `WhoopService.fetchDayData(userId, date)`
     - On success: store all fields in snapshot, `fetchStatus = READY`
     - On error: `fetchStatus = FAILED`, check if max attempts reached
   - `runRetryLoop()`:
     - Get all snapshots where `fetchStatus = FAILED` and `date = today` and `fetchAttempts < 8`
     - Attempt fetch again for each
   - `runStaleFallback()`:
     - Get all snapshots still PENDING/FAILED at 10:00
     - Copy yesterday's snapshot as today's with `isStale = true`, `fetchStatus = STALE`
     - Deliver immediately
3. Cron schedule (Tashkent timezone):
   - `0 5 30 * * *` — 05:30 sweep
   - `0 6,6 30,7,7 30,8,8 30,9,9 30 * * *` — retries (every 30min 06:00-09:30)
   - `0 10 0 * * *` — 10:00 stale fallback
4. Batch fetches: 500ms delay between users to avoid Whoop rate limits

**Done when:** Cron runs, fetches data for test user, stores in DB correctly.

---

### T10 — Per-User Brief Delivery
**Goal:** Deliver the daily brief to each user at their configured `briefTime`.

**Steps:**
1. Create `src/scheduler/deliver.ts`:
   - `scheduleBriefDelivery()` — runs every minute (lightweight check): get all users whose `briefTime` matches current HH:MM AND have a READY snapshot for today AND `deliveredAt IS NULL`
   - `deliverBrief(userId, snapshot)`:
     - Check subscription access (`hasAccess`)
     - If no access: send paywall message (T8) and stop
     - Load last 7 snapshots from DB for trend calculation
     - Call `AIService.generateBrief(snapshot, user, history)`
     - Call `BriefGenerator.composeBrief(snapshot, aiText, snapshot.isStale)`
     - Send via Telegraf
     - Update `snapshot.deliveredAt = now()`
   - On Gemini failure: use `composeFallbackBrief`, still deliver
   - On Telegram send failure: retry 3x with 30s delay, log if all fail
2. Late delivery note: if `now > user.briefTime + 30min`, prepend "Kechirasiz, ma'lumot kech tayyor bo'ldi 🙏"

**Done when:** Brief is sent at correct time to test user.

---

### T11 — Stale Fallback (10:00 Cutoff)
**Already covered in T9 `runStaleFallback()`.**

**Additional steps:**
1. In brief message: prepend stale notice block — "📅 Bugungi ma'lumot vaqtida kelmadi. Kechagi ko'rsatkichlar asosida tavsiyalar:"
2. In AI prompt: add stale notice instruction (see ARD §5.2)
3. Track `isStale = true` on snapshot so we can filter in analytics later

**Done when:** If test user has no data at 10:00, they receive a stale brief with correct notice.

---

### T12 — On-Demand Query Handler
**Goal:** User sends a text message or taps "❓ Savol berish" → AI answers based on today's data.

**Steps:**
1. Create `src/bot/handlers/messages.ts` — catch all non-command text messages
2. Flow:
   - Check subscription access → if not, send paywall
   - Check daily query count: `on_demand_count` stored in snapshot or separate table. If ≥10 → send "Bugun savollar limitiga yetdingiz (10/10). Ertaga yana so'rashingiz mumkin."
   - Fetch today's snapshot from DB. If `fetchStatus != READY/STALE` → fetch live from Whoop (best effort)
   - Build prompt: system prompt + today's health data + user question
   - Call Gemini → reply to user
   - Increment `on_demand_count`
3. Handle "❓ Savol berish" inline button: set `ctx.session.awaitingQuery = true`, send "Savolingizni yozing:" — then next message goes to query handler
4. Handle "💪 Batafsil" inline button: send `composeFullDetail(snapshot)`

**Done when:** User can ask "Bugun yugursam bo'ladimi?" and get a data-grounded AI answer.

---

### T13 — Weekly Summary (Sunday 21:00)
**Goal:** Every Sunday, send a 7-day summary to all active subscribers.

**Steps:**
1. Create `src/scheduler/weekly.ts`:
   - `generateWeeklySummary(userId)`:
     - Fetch last 7 snapshots from DB
     - Calculate: avg recovery, avg HRV, avg sleep duration, sleep consistency score (stdev of sleep times), total strain, total calories
     - Identify best day (highest recovery) + worst day
     - Build AI prompt: "7 kunlik tahlil" with all averages
     - Generate summary in Uzbek via Gemini
   - `sendWeeklySummaries()` — iterate all active subscribers, generate + send
2. Cron: `0 21 0 * * 0` (Sunday 21:00 Tashkent)
3. Message format:
   - Header: "📊 Haftalik hisobot — {date range}"
   - Avg recovery + trend emoji
   - Sleep consistency score (simple: "Uyqu tartibi: Yaxshi/O'rtacha/Yomon")
   - Strain vs recovery balance
   - Key insight + focus for next week
4. Skip users who have <3 snapshots that week (not enough data)

**Done when:** Weekly summary sends correctly on Sunday with real data.

---

## 💰 Week 3 — Monetization

> **Payment strategy:**
> - **Phase 1 (launch → ~50 users):** Manual p2p — Click/Payme card transfer. User pays → notifies bot → admin confirms via inline button. Zero fees, zero paperwork.
> - **Phase 2 (50+ users):** Click or Payme merchant API — auto-confirmation via webhook. Same `activatePaid()` call, just triggered automatically.
> - **Phase 3 (international):** Polar.sh or Stripe — when price justifies fees (~$8-10+/month).
> 
> Price: **50,000 UZS/month** (~$4). SubscriptionService is payment-provider agnostic — only the trigger changes between phases.

### T14 — SubscriptionService
**Goal:** Core subscription logic — trial, access checks, expiry. Payment-provider agnostic.

**Steps:**
1. Create `src/services/subscription.ts`:
   - `startTrial(userId)` — create subscription row: `status: 'trial', trialStart: now, trialEnd: now + 14d`
   - `hasAccess(userId): Promise<boolean>` — check trial/paid status, auto-expire if needed
   - `getStatus(userId): Promise<SubscriptionStatus>` — returns full status object for /status command
   - `activatePaid(userId, paymentRef?: string): Promise<void>` — set status: 'active', paidUntil: now + 30d, store paymentRef. Idempotent.
   - `extendPaid(userId, paymentRef?: string): Promise<void>` — additive: paidUntil += 30d
   - `expireSubscription(userId): Promise<void>` — revert to expired
2. Called from: deliver.ts (access check), T17 admin confirmation handler
3. Admin alert: if `activatePaid` fails → send Telegram to admin (userId 45118778)

**Note:** `chargeId` field in schema renamed to `paymentRef` — generic enough for manual ref, Click order ID, or future Polar checkout ID.

**Done when:** Service works for all states (trial/active/expired). `hasAccess` correctly gates content.

---

### T15 — Trial Warning Messages
**Goal:** Proactively warn users before trial expires.

**Steps:**
1. Create `src/scheduler/maintenance.ts`:
   - Cron: daily 09:00 Tashkent
   - `sendTrialWarnings()`:
     - Find users where `subscription.status = 'trial'` AND `trialEnd` is in 1-2 days
     - Day 2: send warning with [💳 Obuna bo'lish] button
     - Day 1: send urgent warning with [💳 Obuna bo'lish] button
   - `sendExpiryReminders()`:
     - Find active subscribers where `paidUntil` is in 2 days → send renewal reminder
2. Warning copy:
   - Day 2: "⏳ WhoopBro sinovidan 2 kun qoldi. Uzilmaslik uchun obuna bo'ling."
   - Day 1: "⚠️ Ertaga sinoviniz tugaydi! Hisobotlaringiz to'xtatilishini xohlamasangiz, obuna bo'ling."

**Done when:** Warnings send at correct days with subscribe button.

---

### T16 — Subscribe Flow (P2P Payment Instructions)
**Goal:** User taps subscribe → gets payment instructions → notifies bot → admin confirms.

**Steps:**
1. Create `src/bot/handlers/payment.ts`:
   - `sendPaymentInstructions(ctx)`:
     ```
     💳 WhoopBro Pro — 50,000 UZS/oy

     To'lov usullari:
     • Click: 8600 XXXX XXXX XXXX (karta egasi: env dan)
     • Payme: +998 99 869 6682

     To'lovni amalga oshirgach, quyidagi tugmani bosing:
     ```
     Buttons: `[✅ To'ladim] [❌ Bekor qilish]`
   - Card numbers from env: `CLICK_CARD`, `PAYME_PHONE`
   - On `to'ladim` callback: send to admin (ADMIN_TELEGRAM_ID) a notification:
     ```
     💰 Yangi to'lov so'rovi
     👤 {firstName} (@{username})
     🆔 {userId}
     📅 {date}
     ```
     Buttons: `[✅ Faollashtirish] [❌ Rad etish]`
   - Reply to user: "✅ So'rovingiz qabul qilindi. Tez orada faollashtiriladi!"
2. On `paywall` → subscribe button → `sendPaymentInstructions`
3. Add `CLICK_CARD` and `PAYME_PHONE` to config + .env.example

**Phase 2 note:** When Click/Payme merchant is ready, replace `sendPaymentInstructions` with a payment link. Admin confirmation flow removed — webhook calls `activatePaid` directly.

**Done when:** Full p2p flow works — user gets instructions, admin gets notification with action buttons.

---

### T17 — Admin Confirmation Handler
**Goal:** Admin taps Faollashtirish/Rad etish → subscription activated/rejected.

**Steps:**
1. In `src/bot/handlers/payment.ts`:
   - Handle callback `admin_activate:{userId}`:
     - Call `SubscriptionService.activatePaid(userId, 'manual')`
     - Edit admin message: "✅ Faollashtirildi — {userId}"
     - Notify user: "✅ Obuna faollashtirildi! 30 kun davomida to'liq kirish mavjud 💪\n\nHisobot har kuni soat {briefTime} da keladi."
     - If user missed today's brief (deliveredAt IS NULL, past briefTime) → deliver immediately
   - Handle callback `admin_reject:{userId}`:
     - Edit admin message: "❌ Rad etildi — {userId}"
     - Notify user: "❌ To'lov tasdiqlanmadi. Muammo bo'lsa, admin bilan bog'laning."
   - `/admin activate {userId}` command — manual fallback, same as button
   - `/admin stats` command:
     ```
     📊 WhoopBro statistika
     👥 Jami foydalanuvchilar: X
     🔗 Whoop ulangan: X
     🎯 Sinov davri: X
     💳 Faol obuna: X
     📅 Bugun yuborilgan: X
     ```
2. Register admin callbacks in bot index (only respond if ctx.from.id === ADMIN_TELEGRAM_ID)

**Done when:** Admin can activate/reject from Telegram, `/admin stats` shows live numbers.

---

---

### T18 — /settings, /disconnect, /status, /uz, /ru
**Goal:** All user-facing settings commands.

**Steps:**
1. Create `src/bot/handlers/settings.ts`:
   - `/settings`:
     - Show current settings: brief time, language, subscription status
     - Inline keyboard: `[⏰ Vaqtni o'zgartirish] [🌐 Til] [🔌 Whoop uzish]`
   - Brief time setup (conversation flow):
     - Ask user to send new time in HH:MM format
     - Validate format + must be 05:30-22:00 range
     - Save to `user.briefTime`
     - Confirm: "✅ Endi har kuni soat {time} da hisobot olasiz"
   - `/disconnect`:
     - Confirmation prompt: "Haqiqatan ham Whoop hisobingizni uzmoqchimisiz? Barcha ma'lumotlar o'chiriladi."
     - `[Ha, uzish] [Bekor qilish]` buttons
     - On confirm: delete WhoopToken, DailySnapshots, set whoopConnected=false, subscription=expired
   - `/status`:
     - Whoop connection status ✅/❌
     - Subscription status + days remaining
     - Last brief delivery time
   - `/uz` — set language = 'uz', confirm
   - `/ru` — set language = 'ru', confirm

**Done when:** All settings commands work correctly.

---

## 🚀 Week 4 — Infra + Polish + Launch

### T19 — VPS Setup (Nginx + HTTPS)
**Goal:** OAuth callback accessible via HTTPS. Telegram webhook configured.

**Steps:**
1. Register `whoopbro.uz` at ahost.uz (do this at start of Week 4)
2. Point domain DNS A record → VPS IP (89.167.59.119 or wherever it's hosted)
3. Install certbot + nginx on VPS (if not already)
4. Create nginx config:
   ```nginx
   server {
     listen 443 ssl;
     server_name whoopbro.uz;
     ssl via certbot;
     
     location /whoop/callback {
       proxy_pass http://localhost:3001;
     }
     
     location /bot {
       proxy_pass http://localhost:3000;  # Telegraf webhook
     }
   }
   ```
5. `certbot --nginx -d whoopbro.uz`
6. Set Telegram webhook: `https://whoopbro.uz/bot`
7. Set Whoop redirect URI in developer dashboard: `https://whoopbro.uz/whoop/callback`
8. Update `.env` on VPS with production values

**Done when:** `curl https://whoopbro.uz/whoop/callback` returns expected response, webhook is live.

**Blocker:** Domain registration + Whoop developer app credentials needed.

---

### T20 — Systemd User Service
**Goal:** Bot auto-starts on boot, restarts on crash.

**Steps:**
1. Build project: `npm run build`
2. Create `~/.config/systemd/user/whoopbro.service`:
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
3. `systemctl --user enable whoopbro`
4. `systemctl --user start whoopbro`
5. `journalctl --user -u whoopbro -f` — verify clean startup

**Done when:** Service running, survives reboot.

---

### T21 — Startup Recovery
**Goal:** On bot restart, deliver any briefs that were missed while bot was down.

**Steps:**
1. In `src/index.ts`, after bot starts: call `recoverMissedBriefs()`
2. `recoverMissedBriefs()`:
   - Find all snapshots where `date = today` AND `fetchStatus = READY` AND `deliveredAt IS NULL` AND `user.briefTime <= now`
   - Deliver each (with "Kechirasiz, texnik muammo tufayli hisobot kech keldi 🙏" prefix)
   - Also check if today's prefetch ran (check if any snapshots exist for today): if not (bot was down since midnight), run sweep immediately
3. Handle cron missed: if bot starts at 09:00 and weekly was supposed to run at 08:00 Sunday → check day + missed flag in DB

**Done when:** Restarting bot delivers any missed briefs within 1 minute.

---

### T22 — Admin Alerts
**Goal:** Get notified when something breaks in production.

**Steps:**
1. Create `src/utils/admin.ts`:
   - `alertAdmin(message: string)` — sends Telegram message to userId `45118778`
2. Add alerts for:
   - DB connection failed (3 retries)
   - Gemini API down (3 consecutive failures)
   - Whoop API down globally (>50% of users failing)
   - Payment activation failed after retries
   - Unhandled exception caught in global error handler
3. Global error handler in `src/index.ts`: catch uncaught exceptions + unhandledRejections → log + alertAdmin
4. Alert throttling: max 1 alert per error type per 30 min (prevent spam)

**Done when:** Kill DB, bot sends alert to Azamat within 60 seconds.

---

### T23 — End-to-End Test with Real Whoop Account
**Goal:** Full flow tested with real Whoop data.

**Steps:**
1. Connect Azamat's real Whoop account via `/start`
2. Verify OAuth flow works on prod (real domain, real redirect)
3. Trigger manual fetch (dev command `/admin fetch {userId}`) — verify snapshot stored correctly
4. Manually trigger brief delivery — verify message format looks right
5. Test "Batafsil" button — all metrics showing
6. Test on-demand query with real question
7. Test `/disconnect` — verify data wiped
8. Reconnect, set up 14-day trial, verify trial warnings fire
9. Test p2p subscribe flow — tap Obuna, pay, confirm as admin, verify activation
10. Test paywall message with manually expired subscription

**Done when:** All core flows verified with real data.

---

### T24 — Cleanup Cron
**Goal:** Keep DB lean, delete stale data.

**Steps:**
1. In `src/scheduler/maintenance.ts`:
   - Daily 02:00: `DELETE FROM oauth_states WHERE expiresAt < NOW()`
   - Daily 02:00: `DELETE FROM daily_snapshots WHERE date < NOW() - INTERVAL '90 days'`
   - Daily 02:00: check for users who haven't been active in 60 days — log for analytics (don't delete)
2. Register in scheduler index

**Done when:** Cleanup cron runs, DB doesn't grow unbounded.

---

### T25 — Launch
**Goal:** First users from Whoop Uzbekistan community.

**Steps:**
1. Write launch post for Whoop community (inside the Whoop app) — in Uzbek
   - What WhoopBro does
   - How to connect (link to bot)
   - "Birinchi 50 foydalanuvchiga 30 kunlik bepul sinov" (30-day trial instead of 14)
2. Write shorter version for fitness Telegram channels in UZ
3. Extend trial to 30 days for first batch: manually update trial_end in DB for first 50 users (or add promo code logic — skip for launch)
4. Monitor: watch logs + DB for first hour after post
5. Update MEMORY.md with launch date + initial user count

**Blockers:**
- Whoop Uzbekistan community access (Azamat has it — active member)
- Bot must be fully tested (T23 done)

**Done when:** First 10+ real users connected.

---

## 🔒 Blockers (External — Azamat's Action Required)

| Blocker | What's needed | When needed |
|---|---|---|
| Whoop developer app | Register at developer.whoop.com, create app, get `client_id` + `client_secret` | Before T3/T4 |
| Click/Payme card numbers | Add CLICK_CARD + PAYME_PHONE to .env before T16 | Before T16 |
| Click merchant account (Phase 2) | Apply at business.click.uz when 50+ paying users | Post-launch |
| Domain `whoopbro.uz` | Register at ahost.uz (~27,000 UZS/year) | Week 4 only |
| Gemini API key | Already have one? Check `.env`. If not — aistudio.google.com | Before T7 |
| PostgreSQL on VPS | Already running for babycars-bot? Create `whoopbro` DB + user | Before T2 |

---

## 📊 Progress Tracker

| Week | Tasks | Status |
|---|---|---|
| Week 1 | T1–T6 | ✅ Done (2026-03-07) |
| Week 2 | T7–T13 | ✅ Done (2026-03-07) |
| Week 3 | T14–T18 | ✅ Done (2026-03-08) |
| Week 4 | T19–T25 | ⬜ Not started |
