# WhoopBro — Product Requirements Document

**Version:** 1.2  
**Date:** 2026-03-10  
**Author:** Azamat Majidov  
**Status:** Draft

---

## 1. Overview

### What is WhoopBro?
A Telegram bot that connects to your Whoop wearable and delivers daily, science-backed health coaching in Uzbek — something Whoop's own app doesn't offer.

### Core Value Prop
> "Whoop tells you numbers. WhoopBro tells you what to do with your day."

Whoop's AI coach is English-only. 292+ Whoop users in the Uzbekistan community alone don't get that experience in their language. WhoopBro fixes that.

### Target Audience
- Whoop owners in Uzbekistan and CIS
- Personal productivity crowd (biohackers, fitness-conscious professionals)
- Users who track health metrics but want actionable, science-backed guidance

---

## 2. Problem Statement

1. Whoop's AI coaching is English-only — inaccessible to Uzbek/Russian speakers
2. Raw health data (HRV, recovery %, sleep stages) is meaningless without interpretation
3. No localized health coaching tool exists for this market
4. Whoop users are already paying $30+/month — they value health tooling

---

## 3. Solution

A Telegram bot (WhoopBro) that:
- Connects to user's Whoop via OAuth
- Fetches all available health data daily
- Delivers personalized, science-backed recommendations in Uzbek
- Acts as a warm, knowledgeable fitness friend — not a generic chatbot

---

## 4. Bot Persona

**Name:** WhoopBro 💪  
**Language:** Uzbek (default) · Russian (on request via `/ru`)  
**Tone:** Formal (`siz`), warm, friendly — like a certified trainer who respects you  
**Style:** Has opinions, gives real talk, never guilt-trips  
**Tagline:** *"Sizning shaxsiy sport murabbiyingiz"* (Your personal fitness coach)

---

## 5. Whoop Data Sources (API)

All available data fetched via Whoop API v1:

| Data Point | Used For |
|---|---|
| Recovery Score (0-100%) | Day intensity recommendation |
| HRV (Heart Rate Variability) | Nervous system readiness |
| RHR (Resting Heart Rate) | Baseline health trend |
| SpO₂ (Blood Oxygen) | Sleep quality signal |
| Sleep Duration | Sleep debt tracking |
| Sleep Performance % | Sleep quality score |
| Sleep Efficiency % | Sleep optimization tips |
| Sleep Stages (REM/Deep/Light) | Specific recovery advice |
| Respiratory Rate | Illness/stress early warning |
| Daily Strain Score | Training load assessment |
| Caloric Expenditure | Energy balance context (directional) |
| Workout History | Training pattern analysis |

---

## 6. Features — MVP

### F1 — Whoop OAuth Onboarding
- User runs `/start`
- Bot explains value prop in Uzbek
- Sends Whoop OAuth link
- On success: confirms connection, sets daily brief time (default 07:00 Tashkent)

### F2 — Daily Morning Brief
Sent automatically each morning. Contains:

**Block 1: Recovery Status**
- Recovery score with emoji indicator (🟢🟡🔴)
- HRV vs 7-day average (trend)
- RHR vs 7-day average (trend)
- SpO₂
- One-line recovery verdict in Uzbek

**Block 2: Sleep Analysis**
- Sleep duration + performance score
- Stage breakdown (REM/Deep/Light)
- Sleep debt context if applicable
- Science-backed sleep tip (contextual)

**Block 3: Day Recommendation**
- Training intensity recommendation (hard / moderate / active recovery / rest)
- Based on: recovery score + HRV trend + sleep performance + 7-day strain load
- 2-3 specific activity suggestions (e.g. "Bugun og'ir trening qilmang — engil yurish yoki yoga tavsiya etamiz")
- Motivational close (warm, not cheesy)

**Inline Buttons:**
- `💪 Batafsil` — full data breakdown
- `❓ Savol berish` — ask WhoopBro anything about today's data

### F3 — On-Demand Query
- User can ask: "Bugun trening qilsam bo'ladimi?"
- Bot answers based on current day's data + context
- Powered by AI (Claude/Gemini) with Whoop data injected as context

### F4 — Weekly Summary (Sunday)
- 7-day recovery trend
- Sleep consistency score
- Total strain vs recovery balance
- One key insight + one focus area for next week

### F5 — Language Switch
- `/uz` — switch to Uzbek (default)
- `/ru` — switch to Russian
- Preference saved per user

### F6 — Settings
- `/settings` — change daily brief time preference (used as fallback only — see F7)
- `/disconnect` — unlink Whoop account
- `/status` — check connection status

### F7 — Webhook-Driven Event Pipeline

**Architecture:** WhoopBro is event-driven, not time-driven. The daily brief is triggered by Whoop data becoming ready — not by a fixed cron time.

**Why this matters:**
- User sleeps till 9? Brief arrives at 9 when data is ready — not at 07:00 with stale/missing data
- Evening workout warning fires immediately after a high-strain late workout — not at 21:00 regardless of context
- Fewer unnecessary API calls — we fetch only when Whoop tells us something changed

**Webhook events subscribed to:**

| Event | Trigger | WhoopBro Action |
|---|---|---|
| `recovery.updated` | User wakes up, recovery finalized | Fetch recovery + sleep + cycle → store to DB → generate + send daily brief |
| `workout.updated` | Workout created or updated | Fetch workout → store to DB → check evening warning conditions |
| `sleep.updated` | Sleep recorded or updated | Store interim data (deduped by `trace_id`) |
| `*.deleted` | Data removed | Mark record inactive in DB |

**Endpoint:** `POST /webhook/whoop`
- Must respond `200 OK` within 1 second (Whoop requirement)
- All processing is async (enqueue → worker handles)
- Signature validated via HMAC-SHA256 (`X-WHOOP-Signature` header)

**Deduplication:** Whoop may fire same event multiple times. Store `trace_id` in DB — skip if already processed.

**Reconciliation cron (fallback):**
- Runs daily at 10:00 local time per user
- Checks: did we receive `recovery.updated` for this user today?
- If not → fetch manually → store → send brief
- Catches missed webhooks (Whoop guarantees at-most-5-retries, not guaranteed delivery)

**User brief timing:**
- Primary: triggered by `recovery.updated` (whenever data is ready)
- Fallback: reconciliation cron at 10:00 (if webhook was missed)
- `/settings` time preference: used only if user explicitly wants a fixed time reminder in addition to webhook delivery

---

## 6b. Features — Phase 2: AI Insights & Causal Analysis

> **Goal:** Move from "what happened" to "why it happened" — making WhoopBro meaningfully better than the Whoop app itself.
> **Trigger:** Ship after launch stabilization (~50 connected users or 2 weeks post-launch)

### Priority Levels
- 🔴 **P0** — Infrastructure. Nothing else works without this.
- 🟠 **P1** — Core value. Direct answer to user feedback ("I'll pay if I get more than Whoop").
- 🟡 **P2** — Retention & engagement. Keeps users coming back.
- 🟢 **P3** — Power features. For engaged users, upsell hooks.

---

### 🔴 P0 — Historical Data Storage

**What:** Store every day's Whoop metrics in our own DB (not just pass-through to AI).

**Why first:** Every Phase 2 feature depends on historical data. Without this, no pattern detection, no causal analysis, no trend alerts.

**Schema — `daily_metrics` table:**
| Field | Type | Notes |
|---|---|---|
| userId | string | FK to users |
| date | date | One row per user per day |
| recoveryScore | int | 0–100 |
| hrv | float | ms |
| rhr | int | bpm |
| sleepScore | int | 0–100 |
| sleepDuration | int | minutes |
| sleepEfficiency | float | % |
| remDuration | int | minutes |
| deepDuration | int | minutes |
| lightDuration | int | minutes |
| awakeTime | int | minutes |
| disturbances | int | count |
| strain | float | 0–21 |
| avgHr | int | bpm |
| maxHr | int | bpm |
| kilojoules | float | energy |
| journalNotes | JSON | Whoop journal entries |
| latestWorkoutTime | time | For timing analysis (evening workout = bad sleep) |
| rawWhoop | JSON | Full API response backup |

**Retention:** 90 days minimum.
**Backfill:** On first sync, fetch last 30 days via Whoop API date range.

---

### 🟠 P1 — Causal Daily Report Enhancement

**What:** Add a "Why" block to the existing daily brief explaining the cause of today's metrics.

**Current brief:** Shows numbers + recommendation.
**Enhanced brief:** Shows numbers + recommendation + *why today looks the way it does.*

> *"Bugun recovery past (58%) — sababi: kecha soat 20:30 da og'ir trening (strain 17.4) qildingiz. Tana hali tiklanmagan. HRV baseline'dan 22% past. Bugun yengil bo'ling."*

**Implementation:**
- Pull last 7 days from `daily_metrics`
- Build structured text: `date | recovery | hrv | sleep | strain | workout_time | journal`
- Rule engine pre-flags anomalies (HRV drop >20%, strain >15, sleep <6h, late workout)
- Gemini prompt: "Explain why today's metrics look this way. Be specific. Max 2 sentences. Uzbek."
- Inject result into existing brief as new "Sabab" block

**Token cost:** ~700 tokens/day/user. Negligible.

---

### 🟠 P1 — "Nima uchun?" On-Demand Command

**What:** User can ask "Nima uchun uyqum yomon bo'ldi?" or any causal question after receiving the daily brief.

**Flow:**
1. User taps new inline button `🔍 Nima uchun?` or sends free-text question
2. Bot pulls last 14 days of `daily_metrics` for context
3. Gemini analyzes: patterns, anomalies, likely causes
4. Response is conversational, specific to their data

**Key data points for causal reasoning:**
- Late evening workouts → sleep disruption
- High strain days → HRV drop next morning
- Multi-day sleep debt → compounding recovery crash
- Journal entries (stress, caffeine, alcohol) → direct cause mapping
- Respiratory rate spike → illness/overtraining signal

**New inline button added to daily brief:**
```
[💪 Batafsil]  [❓ Savol berish]  [🔍 Nima uchun?]
```

---

### 🟡 P2 — Pattern Detection (7-Day Analysis)

**What:** Detect recurring patterns in user data and surface them proactively.

**Examples:**
> *"3-marta bo'ldi: kechqurun 15+ strain → ertasi HRV 20%+ past. Bu sening tanangning patterni — kechki trening qiyin tiklanishga olib kelmoqda."*

**Detection rules:**
- Same-day combo appears 3+ times in 30 days → flag as pattern
- Combos to track: high strain → low HRV, late workout → poor sleep, low sleep → low recovery chain
- Delivered in weekly summary or as standalone insight when pattern is newly confirmed

---

### 🟡 P2 — Predictive Evening Warning

**What:** Proactive notification ~21:00 if today's data suggests tomorrow will be rough.

**Trigger conditions (any one):**
- Today's strain > user's 7-day avg by 30%+
- Today's strain > 15 AND last night's sleep < 6h (double hit)
- HRV declining 3 consecutive days

**Message example:**
> *"⚠️ Kechqurun eslatma: bugun strain yuqori edi (16.2). Erta recovery past bo'lishi mumkin. Imkon bo'lsa 23:00 gacha uxlashga harakat qiling. 💤"*

**Opt-in:** Enabled by default, user can disable via `/settings`.

---

### 🟡 P2 — Enhanced Weekly Summary

**What:** Replace the current weekly summary (numbers dump) with a narrative story of the week.

**Format:**
- Best day of the week + why
- Hardest day + what caused it
- Key pattern discovered (if any)
- One specific focus for next week (not generic)
- 7-day trend: HRV, recovery, sleep consistency (improving / stable / declining)

---

### 🟢 P3 — Conversational Deep-Dive

**What:** Full AI conversation mode — user can ask anything about their health history.

**Example queries:**
- *"Bu oyda eng yaxshi uyqum qachon edi?"*
- *"Qachon mashq qilsam tiklangim tezroq bo'ladi?"*
- *"Hafta oxiri bilan hafta ichi recovery'im qanday farq qiladi?"*

**Implementation:** Conversation history stored per user (last 20 messages). Full 30-day metrics available as context window for Gemini.

**Limit:** 10 queries/day (Pro tier). Prevents abuse.

---

### 🟢 P3 — Journal Prompting

**What:** WhoopBro asks users to log lifestyle context when patterns suggest it matters.

**Trigger:** If user had bad sleep 2 nights in a row and no journal entries logged in Whoop:
> *"Kecha uyqungiz yomon bo'ldi. Stress, kofein yoki boshqa sabab bo'ldimi? (ha/yo'q yoki qisqacha yozing — tahlil uchun saqlayman)"*

**Storage:** Saved to our `daily_metrics.journalNotes` (not sent to Whoop).
**Value:** Makes causal analysis dramatically more accurate over time.

---

### 🟢 P3 — Admin Analytics

**What:** Daily snapshot of key business metrics, accessible via `/admin` command (owner only).

**Metrics:**
- Total users / connected / paying / trial / expired
- New signups today/week
- Daily active (brief sent + opened)
- Churn (disconnected this week)
- Feature usage: "Nima uchun?" queries, batafsil taps, weekly summary opens

**Storage:** `analytics_events` table — userId, event, timestamp.

---

### Phase 2 Implementation Order

| # | Feature | Priority | Est. Effort |
|---|---|---|---|
| 1 | Historical data storage + backfill | 🔴 P0 | 1 day |
| 2 | Causal daily report block | 🟠 P1 | 1 day |
| 3 | "Nima uchun?" command + button | 🟠 P1 | 1 day |
| 4 | Predictive evening warning | 🟡 P2 | 0.5 day |
| 5 | Pattern detection (7-day) | 🟡 P2 | 1.5 days |
| 6 | Enhanced weekly summary | 🟡 P2 | 1 day |
| 7 | Journal prompting | 🟢 P3 | 1 day |
| 8 | Conversational deep-dive | 🟢 P3 | 2 days |
| 9 | Admin analytics | 🟢 P3 | 1 day |

**Total Phase 2 estimate:** ~10 dev days · Can ship P0+P1 in 3 days as a fast follow after launch.

---

## 7. Science-Backed Recommendation Engine

Recommendations grounded in published sports science:

| Metric | Threshold | Recommendation |
|---|---|---|
| Recovery ≥ 67% (Green) | High readiness | Hard training, high strain OK |
| Recovery 34-66% (Yellow) | Moderate readiness | Moderate training, avoid PRs |
| Recovery ≤ 33% (Red) | Low readiness | Active recovery or rest only |
| HRV ▼ >20% vs baseline | Nervous system stressed | Reduce intensity, prioritize sleep |
| RHR ▲ >5bpm vs baseline | Possible illness/stress | Rest day recommended |
| Sleep < 6h | Significant sleep debt | Nap if possible, no hard training |
| REM < 90min | Cognitive recovery deficit | Evening screen limits, no caffeine after 14:00 |
| Deep < 60min | Physical recovery deficit | Cool room, earlier bedtime |
| Respiratory rate spike | Early illness signal | Monitor, reduce strain |

AI prompt includes data + these rules → generates natural language advice in Uzbek.

---

## 8. Monetization

### Model: Freemium → Subscription

**Free Tier:**
- 14-day full trial
- After trial: only recovery score (no AI coaching)

**Pro Tier — 400 ⭐/month (~$4):**
- Full daily brief
- AI coaching
- Weekly summaries
- On-demand queries (10/day)

### Payment:
- **Phase 1 (launch):** Manual p2p via Click card. User taps "To'ladim" → admin confirms via Telegram inline button. Zero fees.
- **Phase 2 (50+ users):** Click or Payme merchant API — automatic webhook confirmation
- **Phase 3 (international):** Polar.sh or Stripe (~$8-10+/month price point)

### Pricing rationale:
- Whoop users spend $30+/month on the device — $4 is an easy yes
- Uzbekistan price sensitivity accounted for (vs $10+ in Western markets)

---

## 9. Tech Stack

| Layer | Tech |
|---|---|
| Bot framework | Node.js + Telegraf |
| Whoop API | REST v1 (OAuth2 PKCE) |
| Whoop Webhooks | Event-driven data pipeline (recovery / sleep / workout) |
| AI Engine | Gemini Flash Lite (fast, cheap) / Pro for complex queries |
| Database | PostgreSQL (users, tokens, preferences, daily_metrics, webhook_events) |
| Scheduler | node-cron (reconciliation fallback only — not primary brief trigger) |
| HTTP Server | Express (webhook endpoint + OAuth callback) |
| Hosting | VPS (204.168.152.172) |
| Language | TypeScript |

---

## 10. User Flow

```
/start
  → Welcome message (UZ)
  → "Whoop hisobingizni ulang" → OAuth link
  → OAuth success → "✅ Ulandi! Uyqudan turganingizdan so'ng hisobot yuboraman"
  → First brief sent next morning (webhook-triggered)

Event-driven daily flow:
  → User wakes up + Whoop processes data
  → Whoop fires recovery.updated webhook → POST /webhook/whoop
  → WhoopBro: validate signature → enqueue → 200 OK
  → Worker: fetch recovery + sleep + cycle via API → store to daily_metrics
  → Generate brief → Send 3-block message with buttons

Fallback (if webhook missed):
  → Reconciliation cron at 10:00 → check daily_metrics for today
  → If missing → fetch API manually → store → send brief

Workout event flow:
  → User logs workout in Whoop app
  → Whoop fires workout.updated webhook
  → WhoopBro: store workout (incl. time) → if strain > 14 AND time > 19:00 → send evening warning

User taps "💪 Batafsil":
  → Full data breakdown (all metrics)

User taps "❓ Savol berish" or sends message:
  → AI answers based on today's data

User taps "🔍 Nima uchun?" (Phase 2):
  → AI pulls 14-day history → causal narrative response
```

---

## 11. Distribution Strategy

### Phase 1 — Seed (Week 1-2)
- Post in **Whoop Uzbekistan** community (292 members) on Whoop app
- Offer free extended trial (30 days) for first 50 users
- Personal outreach to fitness bloggers/trainers in UZ

### Phase 2 — Organic Growth
- Word of mouth within Whoop UZ community
- Fitness telegram channels in Uzbekistan
- Instagram/LinkedIn content showing real brief examples

### Phase 3 — Expansion
- Russian-speaking CIS market (Kazakhstan, Russia)
- Potentially other wearables (Oura, Garmin) — v2

---

## 12. Success Metrics

| Metric | 30-day target | 90-day target |
|---|---|---|
| Connected users | 50 | 200 |
| Daily active (brief opens) | 60% | 65% |
| Trial → paid conversion | 20% | 25% |
| MRR | $40 | $200 |
| Churn / month | <10% | <8% |

---

## 13. Out of Scope (MVP)

- Nutrition tracking / calorie recommendations (v2 — needs intake data)
- Apple Watch / Garmin / Oura integration (v2)
- Web dashboard (v2)
- Group/social features (v2)
- Payme/Click payments (v2)

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| Whoop API rate limits | Fetch only on webhook events, not on schedule |
| Whoop changes API | Monitor changelog, abstract API layer |
| Webhook delivery failure | Reconciliation cron at 10:00 catches missed events |
| Duplicate webhook events | Deduplicate by `trace_id` stored in DB |
| Webhook endpoint downtime | Whoop retries 5x over ~1 hour; reconciliation as final safety net |
| No webhook for strain/cycles | Fetch via API after `recovery.updated` event covers this |
| Low conversion after trial | Nail the brief quality — wow effect drives upgrades |
| Small market size | CIS expansion path ready, low infra cost |
| Medical liability | Disclaimer: "Bu tibbiy maslahat emas" on every brief |

---

## 15. Timeline (Estimated)

| Week | Milestone |
|---|---|
| 1 | Whoop OAuth + data fetch + DB schema + webhook endpoint (F7) |
| 2 | Daily brief generation (UZ) + AI coaching engine + reconciliation cron |
| 3 | P2P payments (Click card) + subscription logic + uz/ru i18n + reply keyboard |
| 4 | Testing + polish + launch to Whoop UZ community |

> **Note:** Webhook infrastructure (F7) is built in Week 1 alongside OAuth — the `/webhook/whoop` endpoint and the `/whoop/callback` OAuth endpoint live on the same Hono server. Low overhead to add.

**Target launch:** 4 weeks from kickoff
