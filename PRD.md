# WhoopBro — Product Requirements Document

**Version:** 1.0  
**Date:** 2026-03-07  
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
- `/settings` — change daily brief time
- `/disconnect` — unlink Whoop account
- `/status` — check connection status

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
| AI Engine | Claude Haiku (fast, cheap) / Sonnet for complex queries |
| Database | PostgreSQL (users, tokens, preferences, cache) |
| Scheduler | node-cron (daily briefs) |
| Hosting | VPS (Hetzner CX22 or similar) |
| Language | TypeScript |

---

## 10. User Flow

```
/start
  → Welcome message (UZ)
  → "Whoop hisobingizni ulang" → OAuth link
  → OAuth success → "✅ Ulandi! Har kuni ertalab soat 07:00 da hisobot yuboraman"
  → First brief sent next morning

Daily 07:00:
  → Fetch Whoop data → Generate brief → Send 3-block message with buttons

User taps "💪 Batafsil":
  → Full data breakdown (all metrics)

User taps "❓ Savol berish" or sends message:
  → AI answers based on today's data
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
| Whoop API rate limits | Cache data, fetch once per day |
| Whoop changes API | Monitor changelog, abstract API layer |
| Low conversion after trial | Nail the brief quality — wow effect drives upgrades |
| Small market size | CIS expansion path ready, low infra cost |
| Medical liability | Disclaimer: "Bu tibbiy maslahat emas" on every brief |

---

## 15. Timeline (Estimated)

| Week | Milestone |
|---|---|
| 1 | Whoop OAuth + data fetch + DB schema |
| 2 | Daily brief generation (UZ) + AI coaching engine |
| 3 | P2P payments (Click card) + subscription logic + uz/ru i18n + reply keyboard |
| 4 | Testing + polish + launch to Whoop UZ community |

**Target launch:** 4 weeks from kickoff
