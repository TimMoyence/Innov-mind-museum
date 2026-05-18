# Lessons — @sentry/node (v10.49.0)

Project-specific gotchas. Audit enterprise-grade 2026-05-18.

## 🚨 2026-05-18 — F1 HIGH : OTel coexistence pattern CLAUDE.md HALF-IMPLÉMENTÉ
- **Symptôme** : Sentry errors PERDENT silencieusement la corrélation OTel trace_id/span_id. Distributed-tracing BE↔FE rotue tree split silencieux.
- **Cause** : `sentry.ts:42-53` set correctement `skipOpenTelemetrySetup: true` + `getDefaultIntegrationsWithoutPerformance()` (per CLAUDE.md prescription). MAIS `opentelemetry.ts:36-51` build le NodeSDK avec ZÉRO Sentry bridge components :
  - ❌ No `SentryContextManager`
  - ❌ No `SentrySampler`
  - ❌ No `SentryPropagator`
  - ❌ No `SentrySpanProcessor`
  - ❌ `@sentry/opentelemetry` package NOT installed (vérifié via package.json)
- **Conséquence concrète** : `captureException` + `addBreadcrumb` fire INSIDE un active OTel span (Express/HTTP/Postgres) mais Sentry ne peut PAS lire le span actif car le bridge est absent. PATTERNS.md §5.2 exige `SentryContextManager` + `SentrySampler` + `SentryPropagator` + `SentrySpanProcessor` MÊME en error-only mode pour que Sentry errors carry l'active trace context.
- **Status comment** : sentry.ts:40-41 mentionne "Sentry APM/traces no longer reach Sentry dashboard ; spans go exclusively to OTel collector via OTLP. Sentry = errors+breadcrumbs." Ce design (ADR-045) est documenté. MAIS le bridge minimal (error-only mode pattern §5.2) reste obligatoire pour trace correlation.
- **Fix** : voir TD-SN-01 (BLOCKER pre-V1). 2 options :
  - **(a)** Install `@sentry/opentelemetry` + wire `SentryContextManager` + `SentryPropagator` (minimal pattern §5.2 error-only) → restore trace_id sur errors + add explicit `tracePropagationTargets`
  - **(b)** Document explicitement dans CLAUDE.md que coexistence comment est aspirational et trace correlation est intentionally NOT implemented (clarifier ADR-045)
- **Anti-pattern à éviter** : changer la config Sentry/OTel sans avant clarifier ADR-045 (high-blast observability).

## 🚨 2026-05-18 — F2 HIGH : `tracePropagationTargets` MISSING
- **Symptôme** : trace tree BE↔FE silently split (CLAUDE.md gotcha explicite).
- **Cause** : `sentry.ts:42-53 Sentry.init({...})` omits `tracePropagationTargets` entirely. No regex/string array passed. CLAUDE.md mentionne explicitement : `tracePropagationTargets doit être explicite (['^https://api.musaium\\.com/']) sinon trace tree BE↔FE split silencieux`.
- **Conséquence** : outgoing HTTP requests from backend reçoivent éventuellement PAS les correct sentry-trace/baggage headers. Default propagation behavior of @sentry/node avec `skipOpenTelemetrySetup:true` + no `@sentry/opentelemetry` installed = no propagation.
- **Fix** : voir TD-SN-02. Add `tracePropagationTargets: [/^https?:\/\/api\.musaium\.com\//, /^https?:\/\/localhost:3000\//]` aux Sentry.init opts.

## 2026-05-18 — F4 MEDIUM : `initSentry()` runs AFTER tous les imports
- **Symptôme** : Sentry auto-instrumentation (any integration that monkey-patches at init time) misses modules loaded above.
- **Cause** : `index.ts:1` importe `./instrumentation` (OTel setup FIRST, OK). MAIS `initSentry()` est appelé à `index.ts:461` INSIDE async `start()`, APRÈS tous les 40+ imports (lines 5-50) et APRÈS `createApp()` side effects.
- **Mitigation actuelle** : `skipOpenTelemetrySetup:true` (la plupart du patching skipped) + OTel handle l'instrumentation. Snapshot warning PATTERNS.md s'applique toujours.
- **Fix** : voir TD-SN-03 (combiné avec F1). Move `initSentry()` dans `instrumentation.ts` AVANT OTel init.

## 2026-05-18 — F5 LOW : `profilesSampleRate` DÉPRÉCIÉ
- **Symptôme** : works en 10.49.0 mais emits deprecation. Break sur next major.
- **Cause** : `sentry.ts:47` passe `profilesSampleRate: env.sentry.profilesSampleRate`. PATTERNS.md note deprecated since v10.27.0 en faveur de `profileSessionSampleRate` + `profileLifecycle`.
- **Fix** : voir TD-SN-04. Single-key swap + env rename, no behavior change today.

## 2026-05-18 — Validations positives (conformité confirmée)
- ✅ **`captureException` via `withScope`** : sentry.ts:70-86 `captureExceptionWithContext` utilise Sentry.withScope + scope.setTag inside callback (NOT global setTag pollution). audit.service.ts:188-206 même pattern.
- ✅ **Express error handler ordering** : `app.ts:233` mount /api router → `:235 setupSentryExpressErrorHandler(app)` → `:236 errorHandler`. Routes → Sentry → custom error middleware (PATTERNS.md §4 DON'T 'Place setupExpressErrorHandler before routes' respecté).
- ✅ **DSN env-sourced + scrubbing** : `dsn: env.sentry.dsn`. `beforeSend wired to scrubEvent` (sentry-scrubber.ts). `beforeBreadcrumb wired to shouldDropBreadcrumb`. `sendDefaultPii:false`.
- ✅ **v9→v10 migration clean** : 0 usage de `Hub`, `BaseClient`, `hasTracingEnabled`, `@sentry/core logger` dans les 3 fichiers scannés. Utilise `getActiveSpan`, `startSpan`, `withScope`, `setupExpressErrorHandler`, `getDefaultIntegrationsWithoutPerformance` — tous v10 canonical.
