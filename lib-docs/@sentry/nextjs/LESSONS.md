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
