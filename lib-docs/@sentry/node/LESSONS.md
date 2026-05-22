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

## 2026-05-20 — Refresh audit (UFR-022) : 3 fixes confirmés, 1 gap résiduel

Re-scan codebase 2026-05-20 vs LESSONS 2026-05-18. Les 3 PRs intermédiaires (TD-SN-02, TD-SN-03, TD-SN-04) ont landé. Re-fetch docs Sentry 10.49→10.53 + Security Advisories + Profiling + Sensitive Data pages.

### ✅ F2 RESOLVED — `tracePropagationTargets` ajouté
- **État 2026-05-18** : option MISSING dans `Sentry.init(...)`.
- **État 2026-05-20** : `sentry.ts:48` contient `tracePropagationTargets: [/^https:\/\/api\.musaium\.com/, /^http:\/\/localhost:3000/]` — explicite, deux entrées (prod + local). Conforme CLAUDE.md §"Sentry+OTel Node SDK v2". TD-SN-02 closed.

### ✅ F4 RESOLVED — `initSentry()` boot ordering
- **État 2026-05-18** : `initSentry()` appelé `index.ts:461` après 40+ imports.
- **État 2026-05-20** : refactor → fichier dédié `museum-backend/src/instrumentation.ts` (commit 2026-05-19 d'après les comments inline). `index.ts:1` = `import './instrumentation';` (premier import, avant `reflect-metadata`). `instrumentation.ts:15-16` ordre Sentry-first puis OTel-second (commentaire `instrumentation.ts:6-9` explicite la rationale). Conforme PATTERNS.md §3 "DO: Init Sentry in a dedicated instrumentation entrypoint". TD-SN-03 closed.

### ✅ F5 RESOLVED — `profilesSampleRate` → `profileSessionSampleRate`
- **État 2026-05-18** : `profilesSampleRate: env.sentry.profilesSampleRate` (deprecated depuis v10.27.0).
- **État 2026-05-20** : `sentry.ts:50-51` `profileSessionSampleRate: env.sentry.profileSessionSampleRate, profileLifecycle: 'trace'`. Env var renommée `SENTRY_PROFILE_SESSION_SAMPLE_RATE` (`env.ts:246`). API v10.27.0 canonical. TD-SN-04 closed.

### ⚠️ F1 PARTIALLY RESOLVED — OTel bridge components TOUJOURS pas installés
- **Persistant 2026-05-20** : `@sentry/opentelemetry` package toujours absent du `package.json`. `sentry.ts:52` set bien `skipOpenTelemetrySetup: true` + `sentry.ts:53` set `getDefaultIntegrationsWithoutPerformance()`, MAIS le code-path est INCOMPLET selon PATTERNS.md §5.1.
- **Conséquence trace correlation** : `Sentry.captureException(e)` invoqué INSIDE un OTel span actif (Express/HTTP/Postgres instrumentation) NE peut PAS attacher le trace_id/span_id OTel parce que `SentryContextManager` n'est pas registered sur le NodeTracerProvider. Errors et spans sont seulement correlatable via timestamp + `requestId`.
- **Designed ainsi (ADR-045)** : commentaire `sentry.ts:42-43` confirme *"Sentry APM/traces no longer reach Sentry dashboard ; spans go exclusively to OTel collector via OTLP. Sentry = errors+breadcrumbs."* Le `tracePropagationMiddleware` (`trace-propagation.middleware.ts`) compense partiellement en stampant `musaium.parent.trace_id` sur les OTel spans côté serveur. **Ce comment est aligné avec un design choisi**, pas un bug — mais le coût UX (Sentry dashboard sans deep-link OTel) reste réel.
- **Action recommandée** : décision binaire à locker dans ADR-045 amendment.
  - Option (a) — installer `@sentry/opentelemetry`, wire `SentryContextManager` + `SentryPropagator` minimal (PATTERNS.md §5.2 error-only mode, pas de `SentrySpanProcessor` pour ne PAS dupliquer les spans côté Sentry). Reste backward-compatible avec OTLP path.
  - Option (b) — locker ADR-045 explicitement : "Sentry deep-link OTel trace_id n'est PAS un goal V1, surveiller via `requestId` cross-pipeline pivot." Doc-curator note pour les reviewers : pas un BLOCK, mais signal à émettre quand quelqu'un veut "savoir d'où vient cette erreur en regardant Sentry".
- **Verdict refresh** : pas un blocker pre-V1, mais reste TD-SN-01 ouvert (downgrade BLOCKER → MEDIUM).

### Observations refresh (positives, nouvelles)

- ✅ **Security advisory check 2025-11-24 (GHSA-6465-jgvq-jhgp Moderate)** : `sendDefaultPii: true` peut leak Authorization/Cookie headers. Musaium = `sendDefaultPii: false` (`sentry.ts:54`). **NOT AFFECTED**. Aucune 2026 advisory contre `@sentry/node` au fetch 2026-05-20.
- ✅ **PII scrubber unchanged + parité maintenue** : `sentry-scrubber.ts:19-22` `hashEmail()` SHA-256 8-char fingerprint. `@musaium/shared` shared scrubber. `scripts/sentinels/sentry-scrubber-parity.mjs` actif (BE/FE/web parity).
- ✅ **CORS `sentry-trace` + `baggage` allowlist** : `app.ts:150-151` confirmé. Preflight ne strip plus, BE↔FE trace headers survivent.
- ✅ **Release window 10.49.0→10.53.1** : ZÉRO breaking change pour `@sentry/node` (Hono-only break en 10.51, AI SDK break en 10.48 antérieure à notre pin). Upgrade 10.53.1 LOW RISK quand cost-discipline le permet.
- ✅ **`tracePropagationMiddleware` documentation** : `trace-propagation.middleware.ts:12-19` explique clairement pourquoi le bridge OTel-propagator n'est PAS wired (ADR-045 cross-constraint). Comment self-documenting, reviewer-friendly.

### Anti-pattern à RAYER (rectification)

LESSONS 2026-05-18 mentionnait "BLOCKER pre-V1" pour TD-SN-01. **Rectification 2026-05-20** : après inspection ADR-045 + comment `sentry.ts:42-43`, le design "spans → OTLP only, Sentry = errors+breadcrumbs" est INTENTIONNEL. Le manquement n'est pas un bug-blocker — c'est un trade-off documenté à ratifier dans un amendment ADR-045. **TD-SN-01 downgrade HIGH → MEDIUM, retiré de la P0 launch-blocker list**.
