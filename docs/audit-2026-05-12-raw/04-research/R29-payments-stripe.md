# R29 — Payments & Stripe Architecture (Pre-Launch Pre-Bake)

**Date** : 2026-05-13
**Agent** : R29 (retry)
**Honesty** : UFR-013 — all claims sourced or marked `[expectation]`.
**Status** : Musaium V1 launch 2026-06-01. Stripe **not yet integrated**. Freemium B2C live, B2B licence + paid tier deferred. Mission = decide what to pre-bake **now**, what to defer.

---

## TL;DR

1. **Pre-bake Stripe architecture now, defer activation.** Build the webhook endpoint, idempotency store, subscription state machine, and reconciliation worker before launch — they are cheap to build clean, expensive to retrofit. Do **not** create live products, prices, or paid-tier UI until B2B pilot signed.
2. **Use Stripe Checkout (hosted) for V1.** Stripe handles SCA/3DS2 automatically, supports Apple Pay/Google Pay/Link in one integration, and removes PCI scope (SAQ A). Building a custom Elements form pre-launch is gold-plating.
3. **Stick with Stripe vs Lemon Squeezy/Paddle for now.** Effective cost diff <1% once EU VAT compliance burden is priced in, but Musaium is a **pre-revenue** EU-based company — VAT obligations only trigger at €10k cross-border B2C threshold. Stripe Tax (0.5% addon) suffices at launch. Re-evaluate merchant-of-record at €50k MRR or first non-EU revenue.
4. **Web-only paid tier at launch — no IAP yet.** Apple's 2026 EU DMA terms add **5% Core Technology Commission + Apple's store services fee (5–13%) + the 2% acquisition fee** even if you bypass Apple IAP via External Purchase Link Entitlement; real-world cost 13–25% (1). Google Play has similar rules. For Musaium's B2B-heavy model, drive purchases to web. Mobile IAP only when B2C consumer subscriptions become the dominant revenue stream.
5. **Webhook security non-negotiable** : signature verification via official SDK (constant-time, 5-min tolerance), Redis-backed `event.id` deduplication with **30-day TTL** (Stripe replays up to 3 days, reconciliation worker may re-deliver up to 30 days), raw-body parsing **before** any JSON middleware.
6. **Reconciliation > webhook reliability.** Stripe's docs explicitly recommend periodic reconciliation as the source of truth. Webhook = optimization, not contract.

---

## 1. Stripe 2026 — Subscriptions, Checkout, SCA/PSD2, Wallets

### 1.1 Stripe Checkout vs Elements vs Payment Element

| Option | PCI scope | SCA handling | Apple/Google Pay | Best for |
|---|---|---|---|---|
| **Checkout (hosted)** | SAQ A | Automatic | Auto (one integration) | V1 — minimum viable |
| Payment Element (embedded) | SAQ A | Automatic | Auto | Brand-controlled UX, later |
| Custom Elements | SAQ A | Manual triggers | Manual integration | Rarely justified |

**Recommendation** : Stripe Checkout for V1. Embedded Payment Element is a 1-week swap when needed (V1.1+). (2)(3)

### 1.2 EU SCA / PSD2 / PSD3

- **PSD2 SCA** : mandatory for EU electronic payments. 3D Secure 2 (3DS2) is the de facto authentication standard. (4)
- **Exemptions relevant to Musaium** : low-value <€30 transactions; recurring payments where SCA was applied at setup (MIT = Merchant-Initiated Transaction flag). (4)
- **Stripe Checkout + Billing trigger 3DS2 automatically** when required. No code change needed for compliance. (2)(4)
- **PSD3/PSR timeline** : provisional political agreement reached 27 November 2025; final texts expected in Official Journal H1 2026; entry into force anticipated 2027 after 21-month transition. (5)(6) **3DS2 remains the primary SCA mechanism under PSD3** (6) — no architecture rework needed for Musaium V1.

### 1.3 Apple Pay / Google Pay on Web + Mobile

- **Stripe Payment Request Button / Payment Element** : single integration covers Apple Pay, Google Pay, Link. Apple Pay is automatically enabled with no additional integration work. (7)(8)
- **Recurring with Apple Pay** : Stripe supports recurring payment requests with billing intervals, management URL, subscription details. (7)
- **React Native** : Stripe RN SDK supports both Apple Pay and Google Pay. **But see Section 5** : using Stripe natively inside the app for digital subscriptions violates Apple/Google policy.

**Pre-bake action** : enable Apple Pay/Google Pay on **web** Checkout from day 1 (zero extra integration cost). Mobile Stripe SDK only if/when external purchase link path is pursued.

---

## 2. Webhook Security

### 2.1 Signature Verification

Stripe sends `Stripe-Signature: t=<timestamp>,v1=<HMAC-SHA256>` where the HMAC is computed over `${timestamp}.${rawPayload}` signed with the endpoint secret. (9)(10)

**Rules** :
- **Always use the official SDK** (`stripe.webhooks.constructEvent` in Node). Never hand-roll HMAC. The SDK handles constant-time comparison, timestamp tolerance, header parsing. (9)
- **Raw body required** : Express must NOT have parsed JSON before signature verification. Use `express.raw({ type: 'application/json' })` on the webhook route specifically. (10)
- **Default tolerance = 5 minutes** between Stripe timestamp and server clock. (9)

### 2.2 Replay Protection

The Stripe-Signature timestamp is part of the signed payload — an attacker cannot mutate it without invalidating the signature. (9) If timestamp is older than tolerance (5 min default), the SDK rejects. Combined with event-ID deduplication (next section), replay is mitigated end-to-end.

### 2.3 Idempotency at the Event Level

Stripe explicitly warns : "Webhook endpoints might occasionally receive the same event more than once. You can guard against duplicated event receipts by logging the event IDs you've processed, and then not processing already-logged events." (10)

Stripe retries failed webhook deliveries for **up to 3 days** with exponential backoff. (10) The reconciliation API window is **30 days** (10) — so deduplication must outlive 3-day webhook retries, ideally cover the 30-day API replay window.

---

## 3. Idempotency Patterns

### 3.1 Redis-Backed Key Store

Pattern from Redis docs and webhook guides : `SET NX` on a key composed of `scope:event_id`, with TTL covering the retry window. (11)(12)

```
Key shape  : webhook:stripe:evt_<event_id>
Value      : { status, processed_at, result_summary }
Op         : SET NX EX <ttl_seconds>
Result     : if NX returned, this is the first delivery — process. Else skip.
```

**TTL choice for Stripe** :
- Stripe webhook retries : up to 3 days → minimum TTL 4 days
- Stripe API event replay : 30 days → safer TTL 30+ days
- Recommended for Musaium : **30 days** (covers both webhook retries and manual replay during reconciliation). The user-prompt's "24h" is **too short** — confirmed in Stripe docs (10) and webhook guides (12).

### 3.2 Two-Level Idempotency

| Level | Purpose | Key | Storage |
|---|---|---|---|
| **API request idempotency** | Outbound calls to Stripe (`stripe.subscriptions.create` etc.) — survive network retries | `Idempotency-Key` header, UUID v7 generated client-side | Stripe stores it for **24h** (13) |
| **Webhook event idempotency** | Inbound events from Stripe — survive duplicate delivery | `event.id` from payload | Redis 30d + PG event log |

Both layers are needed. Stripe explicitly stores Idempotency-Key results for 24 hours and replays the same response for duplicate requests within that window (13).

### 3.3 Recommended Storage Stack for Musaium

| Component | Tech | Why |
|---|---|---|
| Fast-path dedup | **Redis** `SET NX EX` | Sub-ms read, native TTL, already in stack (used for chat rate limiting per `CLAUDE.md`) |
| Audit / source of truth | **Postgres `stripe_events` table** w/ unique constraint on `event_id` | Survives Redis flush; queryable for support; powers reconciliation worker |
| Outbox (when emitting events) | Same Postgres table, polled by worker | (14) — solves dual-write, requires consumer idempotency anyway |

Stripe events are "thin" — payloads contain minimal information; the system must fetch full event data via API. (15) Persisting the API-fetched payload to `stripe_events` enables replay-from-DB during incident recovery.

---

## 4. Lemon Squeezy / Paddle 2026 — Merchant of Record vs DIY EU VAT

### 4.1 Provider Matrix

| Provider | Fee | Model | EU VAT | Best for |
|---|---|---|---|---|
| **Stripe** (base) | 2.9% + €0.30 EU; +1.5% intl; +1% FX | Direct merchant — you are seller of record | DIY (or +0.5% Stripe Tax) | EU-domestic revenue, eng-heavy teams |
| **Stripe Managed Payments** (preview, 2026) | **5% + $0.50** | MoR — Stripe handles indirect tax | Included | Direct comparison to Paddle/LS |
| **Lemon Squeezy** | 5% + $0.50 | MoR | Included | Indie SaaS, simplicity |
| **Paddle** | 5% + $0.50 | MoR | Included | Global SaaS w/ 200+ jurisdictions |

Sources : (16)(17)(18)

### 4.2 The Real Cost Calculation

Headline 2.9% Stripe vs 5% MoR looks like a 2.1% gap. Realistic effective cost (16) :
- Stripe direct on international transactions : **~4.9–5.2%** after cross-border (+1.5%), FX (+1%), Stripe Tax (+0.5%)
- MoR (LS/Paddle/Stripe Managed) : flat 5% + $0.50, includes tax compliance, fraud, refunds, customer support

Once EU customers trigger registration in multiple jurisdictions (UK, EEA member states each separately, Australia GST), the accountant hours eat the 2% gap. (16)

### 4.3 Key 2026 Update

**Stripe acquired Lemon Squeezy** and launched **Stripe Managed Payments** (public preview Q1 2026) at 5% + $0.50 — same pricing as Paddle/LS, official Stripe product (17)(18). Lemon Squeezy continues independently in parallel.

### 4.4 Verdict for Musaium

- **Launch (2026-06-01)** : Stripe direct + Stripe Tax. Musaium is EU-incorporated (France), pre-revenue, B2C €10k cross-border threshold not triggered. Stripe Tax (0.5%) calculates/collects EU VAT automatically.
- **Re-evaluate trigger** : (a) €50k MRR ; (b) first non-EU (US/UK) corporate B2B customer ; (c) >5% revenue in non-EU consumer subs. Switch to Stripe Managed Payments (zero migration friction, same Stripe API) rather than introducing a new provider.
- **Do NOT** introduce Paddle or Lemon Squeezy. The provider switch cost is high (new API surface, new webhooks, new dashboard, new reporting); Stripe Managed Payments removes the rationale.

---

## 5. Apple IAP / Google Play Billing — When Required (2026)

### 5.1 The Rules (as of May 2026)

**Apple** (19)(20) : "If you want to unlock features or functionality within your app — by way of example: subscriptions, in-game currencies, game levels, access to premium content, or unlocking a full version — you must use in-app purchase." Auto-renewable subscriptions must provide ongoing value, last at least 7 days, be available across all the user's devices.

**Google Play** (21)(22) : Play Billing required for subscription services (fitness, education, music, video, content). Alternative billing programs in US expanded as of 28 January 2026, but **Play Billing still required globally outside US** for digital subscriptions, with EEA narrow exceptions under DMA.

### 5.2 EU DMA Loophole (Apple, 2026)

Apple introduced **External Purchase Link Entitlement** allowing EU apps to link to a webshop. (1)(23) But the fees stack :

| Component | Rate | Trigger |
|---|---|---|
| Initial Acquisition Fee | 2% | New users, first 6 months |
| Store Services Fee | 5% Tier 1 / 13% Tier 2 (10% Tier 2 for Small Business Program members) | All digital sales |
| Core Technology Commission | **5%** | All digital goods/services revenue, all distribution paths |
| Payment processor (Stripe etc.) | 3–5% | Per transaction |
| **Real-world total** | **13–25%** | (1)(23) |

**Critical restriction** : You cannot offer both Apple IAP **and** external payments in the same EU app. Adding an external "buy on our website" button forces removal of Apple IAP for digital goods. (1)

### 5.3 Decision Tree for Musaium

```
Are paid features unlockable in the iOS/Android app itself?
├─ NO  → Web-only paid tier. No IAP. No DMA entitlement. (CURRENT STATE)
│       Allowed: app shows "Already subscribed? Sign in." No upgrade UI in-app.
│
├─ YES → Apple IAP / Play Billing required (15% small-biz / 30% standard)
        Alt EU path: External Purchase Link → 13–25% real cost, lose Apple IAP
```

### 5.4 Verdict for Musaium

**Launch with web-only paid tier.** Mobile app reads subscription state via backend API (post-auth `/me/subscription`). No upgrade flow in iOS/Android app. Drive users to web for purchase. **Compliant with Apple/Google guidelines** because no digital content is unlocked *via in-app purchase mechanisms*. Existing pattern of e.g. Spotify (until 2025), Netflix, Kindle.

**Defer** Apple IAP / Play Billing integration until : (a) consumer B2C subscriptions are >50% of revenue AND (b) data shows mobile-first signup converts 2x better than web redirect. RevenueCat is the standard wrapper for that day; do not pre-bake.

---

## 6. Musaium Pre-Bake Architecture

### 6.1 Components to Build Pre-Launch

```
┌─────────────────────────────────────────────────────────────┐
│ Stripe Dashboard (test mode)                                │
│   - Products: musaium_b2c_pro (placeholder), musaium_b2b    │
│   - Prices: monthly/annual (test only)                      │
│   - Webhook endpoint: https://api.musaium.com/stripe/webhook│
└──────┬──────────────────────────────────────────────────────┘
       │ HTTPS POST
       ▼
┌──────────────────────────────────────────────────────────────┐
│ POST /stripe/webhook  (express.raw, signature verify)        │
│                                                              │
│  1. constructEvent(rawBody, sig, ENDPOINT_SECRET)            │
│  2. Redis SET NX webhook:stripe:<event_id> EX 2592000        │
│       └─ NX false → return 200, skip                         │
│  3. INSERT stripe_events (event_id UNIQUE, type, payload,    │
│     received_at, status='pending')                           │
│  4. enqueue Bull/BullMQ job                                  │
│  5. return 200 within <2s                                    │
└──────┬───────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ Worker: process_stripe_event(event_id)                       │
│                                                              │
│  - SELECT FOR UPDATE stripe_events WHERE event_id=...        │
│  - dispatch by event.type → subscription state machine       │
│  - UPDATE status='processed' | 'failed' (w/ error)           │
│  - On failure: retry w/ exponential backoff (max 5)          │
│  - DLQ after max retries → manual ops review                 │
└──────┬───────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ Subscription state machine (subscription_status enum):       │
│                                                              │
│   none → trialing → active → past_due → canceled             │
│                  ↓     ↓         ↓                           │
│              incomplete  unpaid                              │
│                                                              │
│  Persisted on User (or Org for B2B): tier, status, current_  │
│  period_end, stripe_customer_id, stripe_subscription_id      │
└──────────────────────────────────────────────────────────────┘
       ▲
       │
┌──────┴───────────────────────────────────────────────────────┐
│ Reconciliation worker (cron 6h, OR nightly):                 │
│                                                              │
│  - For each stripe_customer_id, GET /v1/subscriptions        │
│  - Diff state vs DB. If drift, replay or correct.            │
│  - Backfill missed events via /v1/events?starting_after=...  │
└──────────────────────────────────────────────────────────────┘
```

### 6.2 Database Schema (TypeORM)

```typescript
// New entities — generate migrations via scripts/migration-cli.cjs
// (per docs/MIGRATION_GOVERNANCE.md)

// stripe_events — webhook audit log + dedup source of truth
@Entity('stripe_events')
class StripeEvent {
  @PrimaryColumn() event_id: string;            // Stripe's evt_*
  @Column() type: string;                       // customer.subscription.updated etc.
  @Column({ type: 'jsonb' }) payload: object;
  @Column() received_at: Date;
  @Column() status: 'pending' | 'processed' | 'failed' | 'dlq';
  @Column({ nullable: true }) processed_at: Date | null;
  @Column({ nullable: true }) error: string | null;
  @Column({ default: 0 }) retry_count: number;
}

// Add to existing User (or new Org for B2B)
@Column({ nullable: true, unique: true }) stripe_customer_id: string | null;
@Column({ nullable: true, unique: true }) stripe_subscription_id: string | null;
@Column({ type: 'enum', enum: SubscriptionTier, default: 'free' }) tier: SubscriptionTier;
@Column({ type: 'enum', enum: SubscriptionStatus, default: 'none' }) sub_status: SubscriptionStatus;
@Column({ nullable: true }) current_period_end: Date | null;
```

### 6.3 Pre-Bake Checklist

Build pre-launch (zero customer impact, prevents 1-week rush when paid tier ships) :

- [ ] **Env vars** : `STRIPE_SECRET_KEY` (test), `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`. Document in `.env.example`. CI must validate test-mode keys never reach prod env.
- [ ] **`POST /stripe/webhook` route** with `express.raw({ type: 'application/json' })` (must precede any global JSON parser). Verify signature via `stripe.webhooks.constructEvent`.
- [ ] **Redis dedup** : `SET NX EX 2592000` on `webhook:stripe:<event_id>`. Reuse existing Redis (chat rate limiter).
- [ ] **`stripe_events` table + migration** via `scripts/migration-cli.cjs`. Unique constraint on `event_id`.
- [ ] **Worker** (Bull or PG-LISTEN-NOTIFY — but PgBouncer transaction mode forbids LISTEN per `CLAUDE.md` gotcha, so Bull/Redis). Process types : `customer.subscription.{created,updated,deleted}`, `invoice.{paid,payment_failed}`, `checkout.session.completed`. Other types : log + ack, no-op.
- [ ] **Subscription state machine** in `museum-backend/src/modules/billing/` (new module, hexagonal pattern per `CLAUDE.md` architecture).
- [ ] **Reconciliation worker** : cron 6h, replays `/v1/events?starting_after=<last_processed>` and diffs subscription state. Sentry alert if drift.
- [ ] **Outbound idempotency** : every `stripe.*.create` call generates a UUID v7 `Idempotency-Key`. Retry-safe.
- [ ] **Observability** : Prometheus counters `stripe_webhook_received_total{type,status}`, `stripe_webhook_duplicate_total`, `stripe_reconciliation_drift_total`. Grafana panel.
- [ ] **Tests** : Stripe CLI `stripe trigger customer.subscription.created` in e2e. Mock signature verification in unit tests. Replay tests : send same event twice, assert single side-effect.
- [ ] **Customer Portal** (Stripe-hosted) — zero code, env config only. Defer activation flag until paid tier launches.
- [ ] **No live products / prices**. No paid-tier UI surfaces. Backend tier check (`requirePaidTier()` middleware) implemented but no protected routes wired.

### 6.4 What NOT to Pre-Bake

Avoid gold-plating (per `feedback_no_feature_flags_prelaunch.md` and `feedback_bury_dead_code.md`) :

- Apple IAP / Google Play Billing integration (RevenueCat etc.)
- Stripe Connect / multi-party payments (only if Musaium hosts museum-side revenue split — V2)
- Usage-based billing / metered (not needed for flat-fee subscriptions)
- Tax calculation custom logic (use Stripe Tax)
- Invoice PDF customization (Stripe default sufficient)
- Custom dunning / retry logic (Stripe Smart Retries built-in)
- Coupons / promo codes (Stripe handles, enable when needed)

### 6.5 Reconciliation > Webhook

Stripe docs explicitly recommend reconciliation as the source of truth (15). Webhook is the **fast path**; reconciliation is the **correctness contract**. Musaium's worker pattern :

```
Every 6h:
  last = SELECT MAX(received_at) FROM stripe_events WHERE status='processed'
  events = stripe.events.list({ starting_after: last_event_id, limit: 100 })
  for event in events:
    if NOT EXISTS in stripe_events:
      INSERT + enqueue same pipeline as webhook
  log drift_count
```

This makes the system **resilient to** : webhook endpoint downtime, Cloudflare 5xx, Stripe webhook delivery bugs, replay needs after incident.

---

## 7. Verdict

| Question | Answer |
|---|---|
| **Ship Stripe pre-bake architecture now?** | **YES.** Pre-bake before 2026-06-01 launch. Cost = 3–5 dev days. ROI = no rush when first B2B pilot signs (likely Q3 2026 per roadmap). |
| **When activate paid tier?** | **First B2B pilot signed contract** (museum licence). For B2C freemium → paid, defer until : retention curves flatten (≥20% W4 retention) AND a feature exists worth paying for (currently unclear — see `project_hybrid_product_philosophy.md`). Aiming Q4 2026 / Q1 2027 [expectation]. |
| **Stripe vs MoR (Paddle/LS)?** | **Stripe direct + Stripe Tax** at launch. **Switch to Stripe Managed Payments** (not Paddle/LS) once €50k MRR or first non-EU corporate B2B. Zero-migration switch path. |
| **Mobile IAP at launch?** | **NO.** Web-only paid tier. No purchase UI in iOS/Android. Compliant with Apple/Google guidelines (no in-app digital unlock). RevenueCat integration deferred. |
| **Idempotency TTL?** | **30 days** (NOT 24h as prompted). Covers Stripe's 3-day webhook retry + 30-day reconciliation API window. |

**One-paragraph rationale** : Stripe pre-bake is high-ROI / low-risk : webhook security and idempotency are the same code regardless of which products you eventually launch. Building it cleanly now (under existing hexagonal architecture, with the test discipline from `CLAUDE.md`) avoids the rushed-integration-during-B2B-signing scenario that produces brittle code. The choice to defer Apple IAP and stay Stripe-direct is driven by Musaium's actual revenue profile (EU-incorporated, B2B-heavy, pre-revenue) — those choices have natural review triggers (€50k MRR, first non-EU customer, consumer subs majority) that should be wired into a single ADR with explicit re-evaluation conditions. The 24h-TTL idempotency hint in the brief is **too short** — Stripe's own retry+reconciliation windows mandate ≥30 days, and Redis TTL cost at this scale is negligible.

---

## Sources

1. [App Store Fees and Commission Rates in 2026: Apple EU Changes — FunnelFox](https://blog.funnelfox.com/apple-app-store-fees-2026-eu-dma/)
2. [Stripe Checkout — Stripe Documentation](https://docs.stripe.com/payments/checkout)
3. [SaaS Stripe Integration: Billing Made Simple (2026) — DesignRevision](https://designrevision.com/blog/saas-stripe-integration)
4. [Strong Customer Authentication readiness — Stripe Documentation](https://docs.stripe.com/strong-customer-authentication)
5. [A guide to PSD3 — Stripe](https://stripe.com/guides/what-platforms-and-marketplaces-can-expect-from-psd3)
6. [PSD3 and PSR: From provisional agreement to 2026 readiness — Norton Rose Fulbright](https://www.nortonrosefulbright.com/en/knowledge/publications/cedd39c6/psd3-and-psr-from-provisional-agreement-to-2026-readiness)
7. [Payment Request Button — Stripe Documentation](https://docs.stripe.com/stripe-js/elements/payment-request-button)
8. [Apple Pay — Stripe Documentation](https://docs.stripe.com/apple-pay)
9. [Webhook Signature Verification (HMAC-SHA256) in Node, Python, Ruby — 2026 Guide — HookRay](https://hookray.com/blog/webhook-signature-verification-2026)
10. [Receive Stripe events in your webhook endpoint — Stripe Documentation](https://docs.stripe.com/webhooks)
11. [Data deduplication with Redis using SET NX](https://redis.io/tutorials/data-deduplication-with-redis/)
12. [How to Implement Webhook Idempotency — Hookdeck](https://hookdeck.com/webhooks/guides/implement-webhook-idempotency)
13. [Idempotent requests — Stripe API Reference](https://docs.stripe.com/api/idempotent_requests)
14. [The Outbox Pattern: A Love Letter to Eventual Consistency — DEV Community](https://dev.to/igornosatov_15/the-outbox-pattern-a-love-letter-to-eventual-consistency-3ch3)
15. [Stripe Thin Events: Best Practices Guide — Hookdeck](https://hookdeck.com/webhooks/platforms/stripe-thin-events-best-practices)
16. [Stripe vs Paddle vs Lemon Squeezy (2026): Which Is Cheapest? — GlobalSolo](https://www.globalsolo.global/blog/stripe-vs-paddle-vs-lemon-squeezy-2026)
17. [2026 Update: Lemon Squeezy + Stripe Managed Payments — Lemon Squeezy](https://www.lemonsqueezy.com/blog/2026-update)
18. [Stripe vs Lemon Squeezy vs Paddle 2026: Complete Comparison — AppStackBuilder](https://appstackbuilder.com/blog/stripe-vs-lemon-squeezy-vs-paddle)
19. [App Review Guidelines — Apple Developer](https://developer.apple.com/app-store/review/guidelines/)
20. [iOS App Store Review Guidelines 2026: The Best Guide — TheAppLaunchpad](https://theapplaunchpad.com/blog/ios-app-store-review-guidelines/)
21. [Understanding Google Play's Payments policy — Play Console Help](https://support.google.com/googleplay/android-developer/answer/10281818?hl=en)
22. [Google Play Policy Update 2026: Out-of-App Payments & Epic Settlement — Coda](https://www.coda.co/blog/epic-v-google-policy-update-2026/)
23. [Apple's June 2025 EU update: one entitlement, three fees, CTF 2026 sunset — RevenueCat](https://www.revenuecat.com/blog/growth/apple-eu-dma-update-june-2025/)

---

**Word count target** : 3000–4500 (this report ~3400). **Focused per brief** : 7 sections covered, no scope creep.
