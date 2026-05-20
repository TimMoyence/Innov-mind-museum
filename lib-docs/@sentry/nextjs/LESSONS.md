# Lessons — @sentry/nextjs (v10.49.0)

Audit 2026-05-18 : **🚨 CHANGES_REQUESTED — 1 HIGH BLOCKER pre-V1**.

## 🚨 S1 HIGH : `sentry.client.config.ts` est ORPHAN → BROWSER ERRORS NOT CAPTURED
- **Cause** : Next.js 15 + @sentry/nextjs v10 auto-load `instrumentation-client.ts` (project root) — NOT le legacy `sentry.client.config.ts` (v8/v9 layout). File exists in repo MAIS no import found.
- **Impact** : `Sentry.init()` côté client NEVER runs. Browser-side errors landing page / admin SPA = silent. Pre-V1 launch = blind production observability.
- **Fix TD-SNXT-01** : Rename `museum-web/sentry.client.config.ts` → `museum-web/instrumentation-client.ts`. Verify browser devtools that Sentry SDK boots.

## ⚠️ S2 MEDIUM : `onRequestError` wrapper re-implements via dynamic import (extra latency)
- **Cause** : `src/instrumentation.ts:11-18` wraps `captureRequestError` via dynamic import per request.
- **Fix TD-SNXT-02** : Replace par canonical `export const onRequestError = Sentry.captureRequestError;` (PATTERNS §1 L28).

## ⚠️ S3 MEDIUM : `tracesSampleRate: 0.1` hardcoded all 3 configs (no per-env)
- Dev signals lost. PATTERNS §3 DO L160 : `NODE_ENV === 'development' ? 1.0 : 0.1`.
- **Fix TD-SNXT-03** : add env-conditional rate à `sentry.{server,client,edge}.config.ts:12`.

## ⚠️ S4 MEDIUM : `tunnelRoute` + `tracePropagationTargets` MISSING
- `tunnelRoute` : ad-blockers drop ~15-30% browser events. Recommended for B2C landing.
- `tracePropagationTargets` : default-allow generate OPTIONS preflight spam.
- **Fix TD-SNXT-04** : `tunnelRoute: '/monitoring'` in withSentryConfig + explicit allow-list `[/^https?:\/\/api\.musaium\.com\//]` in tracePropagationTargets.

## ✅ Positives
- `withSentryConfig` wraps next.config.ts:37 (with sourcemaps gated on SENTRY_AUTH_TOKEN) ✅
- `src/instrumentation.ts:1-9` NEXT_RUNTIME dispatch correct ✅
- `sentry.server.config.ts` + `sentry.edge.config.ts` present ✅
- `src/app/global-error.tsx:14` calls Sentry.captureException ✅
- `sendDefaultPii: false` + custom scrubber ✅
- No `sideEffects: false` in package.json ✅
- No v9 removed APIs (BaseClient/hasTracingEnabled/_experiments.enableLogs/FID) ✅

## INFO
- N/A : museum-web zero route.ts/route.tsx + zero 'use server' actions (API proxied to museum-backend via rewrites). `withServerActionInstrumentation` not needed.
- `sentry.edge.config.ts` byte-identical to server (no edge-specific tuning) — flags lack of intentional config.

---

## Addendum 2026-05-20 (refresh round, doc-curator)

### Status updates vs 2026-05-18 audit
- **TD-SNXT-01 (S1 HIGH)** — **FIXED**. `museum-web/instrumentation-client.ts` exists, calls `Sentry.init(...)` and exports `onRouterTransitionStart = Sentry.captureRouterTransitionStart`. No orphan `sentry.client.config.ts` remains. Browser-side observability is live.
- **TD-SNXT-02 (S2 MEDIUM)** — **FIXED**. `museum-web/src/instrumentation.ts:11` uses the canonical direct re-export: `export { captureRequestError as onRequestError } from '@sentry/nextjs'`. No dynamic-import-per-request wrapper.
- **TD-SNXT-03 (S3 MEDIUM)** — **FIXED**. All 3 config files (`instrumentation-client.ts:13`, `sentry.server.config.ts:13`, `sentry.edge.config.ts:13`) use `process.env.NODE_ENV === 'development' ? 1.0 : 0.1`.
- **TD-SNXT-04 (S4 MEDIUM)** — **FIXED**. `next.config.ts:48` sets `tunnelRoute: '/monitoring'`. All 3 config files set explicit `tracePropagationTargets: [/^https:\/\/api\.musaium\.com/, /^http:\/\/localhost:3000/]`.

### Net delta verdict 2026-05-20
- All 4 audit BLOCKERs from 2026-05-18 are now resolved in code.
- Library version (10.49.0) is fresh — latest stable is 10.53.1, no Next.js-relevant breaking changes between the two. Optional bump to 10.53.1 is low-risk but NOT required.
- No security advisory affects 10.49.0 (GHSA-2rmr-xw8m-22q9 fixed at 7.77.0; GHSA-6465-jgvq-jhgp fixed at 10.27.0). museum-web is patched and additionally sets `sendDefaultPii: false`.

### New TD entry (P2, informational)

- **TD-47 (distributed tracing — partial coverage)** — SDK auto-fetch instrumentation wires `sentry-trace` + `baggage` from browser code (client bundle) and from RSC paths that use the SDK-patched global `fetch`. BUT `museum-web/src/lib/api.ts` is a hand-written `fetch` wrapper used by the admin panel; the SDK's auto-patch covers it in the browser bundle, but **server-side RSC calls during page render do not propagate trace context for happy-path correlation** (only error-path correlation via `onRequestError`-attached scope). Fix when admin-panel observability becomes a P1: explicitly inject `sentry-trace` + `baggage` headers in `api.ts` mutation helpers using `Sentry.getActiveSpan()` + `spanToTraceHeader()` (or `Sentry.getTraceData()` v10 helper). Currently low priority — wait for first observability gap. Cross-ref CLAUDE.md gotcha `apiPut n'existe pas` (same file, ad-hoc PUT wrappers also miss `X-CSRF-Token` consistency).

### Defence-in-depth note (security advisory GHSA-6465-jgvq-jhgp)
The Authorization/Cookie header leak vulnerability (Moderate, fixed 10.27.0) only triggered when `sendDefaultPii: true`. museum-web sets it to `false` AND runs 10.49.0 → both layers protect.

### `sentry.edge.config.ts` ≡ `sentry.server.config.ts` (still byte-identical)
Not a defect, but flag: museum-web has no real edge code path today (no middleware-side enrichment, no edge route handlers — just CSP nonce generation in `src/middleware.ts`). When/if edge logic grows (e.g. geo-based routing, edge auth), differentiate the edge config (lower sample rate, no replay, different release tag).
