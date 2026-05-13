# F9 — Sentry + OpenTelemetry Integration Audit

**Agent**: F9 (critical-gap) — audit 2026-05-12
**Scope**: Sentry + OTel coexistence across `museum-backend`, `museum-frontend`, `museum-web`
**Date**: 2026-05-13
**Method**: source read (10 files) + 12 WebSearch + 2 WebFetch on docs.sentry.io
**Discipline**: UFR-013 — every assertion sourced or marked `[NOT VERIFIED]`

---

## TL;DR

1. **PII scrubbing is logically consistent across 3 apps but physically duplicated** — 3 near-identical scrubber files (BE/FE/Web), all marked `SOURCE-OF-TRUTH: kept manually in sync`. Drift risk = real, not theoretical. ADR-045 (mentioned in code comments) does not exist yet.
2. **No trace propagation wired between apps** — backend uses OTel for tracing (Sentry tracing disabled via `getDefaultIntegrationsWithoutPerformance`), but neither mobile nor web set `tracePropagationTargets`, and no `traceparent` / `sentry-trace` / `baggage` headers are picked up server-side by the OTel auto-instrumentation in the documented way. Verified by `grep tracePropagationTargets` returning zero in source. Defaults (`[/.*/ ]` for RN) WILL leak the trace header to the API host but the server has Sentry tracing disabled, so the trace tree never reconverges in Sentry. ([Sentry RN trace propagation](https://docs.sentry.io/platforms/react-native/tracing/trace-propagation/))
3. **Backend OTel + Sentry coexistence is correct** (R6 already validated) — `skipOpenTelemetrySetup: true` + `getDefaultIntegrationsWithoutPerformance()` is the canonical 2026 pattern. ([Sentry custom OTel setup](https://docs.sentry.io/platforms/javascript/guides/node/opentelemetry/custom-setup/))
4. **Web does NOT use `skipOpenTelemetrySetup`** — relies on Sentry's auto-OTel. There is no parallel OTel NodeSDK on the Next.js server. Safe but means web traces are Sentry-only (no OTLP export to Grafana Tempo).
5. **Mobile has zero OTel** — only Sentry RN 8.9.1 with `reactNativeTracingIntegration` + `reactNavigationIntegration`. No native OTel SDK conflict possible.
6. **Source maps**: BE uploads via `@sentry/cli` in CI (verified), Web uploads via `withSentryConfig` bundler plugin (gated on `SENTRY_AUTH_TOKEN`), Mobile uploads via `@sentry/react-native/expo` plugin on EAS build. All three pipelines are wired. ([Sentry RN Expo source maps](https://docs.sentry.io/platforms/react-native/sourcemaps/uploading/expo/))
7. **Bug found — `android/sentry.properties` says `project=apple-ios`** (line 3). Verified at `museum-frontend/android/sentry.properties:3`. Source maps for Android builds would land in the iOS project. Mitigated at build time by `eas.json:44` setting `SENTRY_PROJECT=android` env, which `app.config.ts:298` consumes via the Expo plugin — but `sentry.properties` is the fallback for stand-alone `sentry-cli` invocations, so any out-of-EAS local build (e.g. dev menu source-map upload) silently pushes Android maps to the iOS Sentry project. **Low priority but real.**
8. **Replay sessions: NOT enabled anywhere** — grep `replayIntegration` / `replaysSessionSampleRate` / `replaysOnErrorSampleRate` returns 0 hits in all 3 apps. No PII exposure from Replay. Good default for V1.
9. **Cost: `tracesSampleRate` is set everywhere but no `beforeSendTransaction` filter** — health-check / static-asset / OPTIONS requests are sampled at full rate. At 0.1 BE / 0.1 web / 0.2 mobile, this is acceptable for 100k MAU but not optimal. Sentry has automatic health-check deprioritization via Dynamic Sampling but only on paid tiers. ([Sentry Dynamic Sampling](https://docs.sentry.io/organization/dynamic-sampling/))
10. **No alerts wired in code** — alerts are docs-only (10+ references in `docs/AI_VISUAL_SIMILARITY.md`, `docs/adr/ADR-011-rate-limit-fail-closed.md`, `docs/incidents/BREACH_PLAYBOOK.md`, `docs/RUNBOOKS/CERT_ROTATION.md`). Alert rules must be created in Sentry UI — verified at run time only, no IaC.
11. **No release tagging on web or mobile** — only backend sets `release: env.sentry.release`. Web/mobile rely on Sentry's auto-detection from build artefacts (Sentry CLI sets `_sentryRelease` env via withSentryConfig — confirmed via `.next/standalone/server.js` finding `_sentryRelease:"46c97c8d…"`). Mobile uses Expo's `runtimeVersion: '1.0.0'` which the Sentry Expo plugin reads. Functional but inconsistent.
12. **Verdict**: 6 actionable gaps below. Critical = #1 (sentry.properties drift) and #4 (no trace propagation). Defer-to-V1.1 = #5 (extract scrubber to shared package), #6 (Replay opt-in).

---

## 3-app comparison table

| Aspect | museum-backend | museum-frontend (RN) | museum-web (Next.js) |
|---|---|---|---|
| SDK | `@sentry/node` ^10.49.0 | `@sentry/react-native` ^8.9.1 | `@sentry/nextjs` ^10.49.0 |
| Init location | `src/shared/observability/sentry.ts` | `shared/observability/sentry-init.ts` → called from `app/_layout.tsx:53` | `sentry.{client,server,edge}.config.ts` (3 files identical) |
| OTel coexistence | `skipOpenTelemetrySetup: true` + `getDefaultIntegrationsWithoutPerformance()` (CORRECT — see comment lines 46-61) | N/A (no custom OTel) | Sentry auto-OTel (no `skipOpenTelemetrySetup`) |
| Trace propagation outgoing | OTel http instrumentation injects `traceparent` | RN SDK default `tracePropagationTargets: [/.*/]` injects `sentry-trace` + `baggage` on ALL fetch | Sentry Next SDK propagates on fetch (server + client) |
| Trace propagation incoming | OTel http instrumentation reads `traceparent` | N/A (no server) | Sentry Next SDK reads `sentry-trace` |
| `tracesSampleRate` | env `SENTRY_TRACES_SAMPLE_RATE` default 0.1 | hardcoded `0.2` | hardcoded `0.1` (×3 files) |
| `profilesSampleRate` | env `SENTRY_PROFILES_SAMPLE_RATE` default 0 | not set | not set |
| `sendDefaultPii` | `false` | `false` | `false` |
| Custom PII scrubber | `sentry-scrubber.ts` (177 LoC, sha256 8-char hash for emails, scrubs headers/body/URL query/breadcrumbs) | `sentry-scrubber.ts` (177 LoC, 32-bit fold hash — non-crypto by design comment) | `sentry-scrubber.ts` (170 LoC, 32-bit fold hash) |
| Scrubber fields | Same regex `/password|token|secret|api[_-]?key|refresh/i` | Same | Same |
| Scrubber headers | `/^(authorization|cookie|x-api-key|x-auth-token)$/i` | Same | Same |
| Scrubber query-keys | `access_token, api_key, apikey, password, refresh_token, secret, token` | Same | Same |
| Auth breadcrumb drop | `/auth/login, /auth/register, /auth/reset-password, /auth/change-password` | Same | Same |
| Email handling | sha256 → 8 hex chars, raw email deleted | 32-bit fold → 8 hex chars | 32-bit fold → 8 hex chars |
| Source map upload | `@sentry/cli sourcemaps upload` in `.github/workflows/ci-cd-backend.yml:676` | `@sentry/react-native/expo` plugin in `app.config.ts:294-300`, EAS build auto | `withSentryConfig` bundler plugin in `next.config.ts:37-43`, gated on `SENTRY_AUTH_TOKEN` |
| Release tagging | `env.sentry.release` from app version | Expo plugin auto (uses Expo runtime version) | `withSentryConfig` auto-injects `_sentryRelease` (verified `.next/standalone/server.js`) |
| Sentry org | `SENTRY_ORG` secret in CI | `asili-design` default in `app.config.ts:297` | inherited from `withSentryConfig` env |
| Sentry project | `SENTRY_PROJECT_BACKEND` secret | iOS=`apple-ios`, Android=`android` (BUT `sentry.properties` says `apple-ios` for BOTH) | inherited from `withSentryConfig` env |
| Replay | N/A (Node) | NOT enabled | NOT enabled |
| Express error handler / equivalent | `setupSentryExpressErrorHandler(app)` after routes | `Sentry.wrap(RootLayout)` at default export | `onRequestError` hook in `src/instrumentation.ts:11-18` |
| Alerts wired | docs-only references | none in code | none in code |
| `tracePropagationTargets` explicit | N/A (OTel handles) | NOT set (default `[/.*/]`) | NOT set (default `['localhost', /^\//]`) |

---

## Gaps

### G1 — `android/sentry.properties` defaults to iOS project [HIGH/LOW-impact]

`museum-frontend/android/sentry.properties:3` reads `defaults.project=apple-ios`. Identical content as `museum-frontend/ios/sentry.properties:3`. Any out-of-EAS local invocation of `sentry-cli` reading `android/sentry.properties` would push Android source maps to the iOS Sentry project — symptoms in Sentry: unminified iOS stack traces for Android-tagged events.

**Mitigation already in place**: `eas.json:42-50` sets per-platform `SENTRY_PROJECT` env, which `app.config.ts:298` consumes:
```ts
project: typeofString(process.env.SENTRY_PROJECT) ?? 'apple-ios',
```
During EAS builds this overrides the `sentry.properties` value.

**Why still ship a fix**: developers running `npx sentry-expo-upload-sourcemaps` locally bypass EAS and hit the wrong project. Also `app.config.ts:298` falls back to `'apple-ios'` if env is unset — this is the wrong default for an Android-side execution context.

**Fix**: Edit `android/sentry.properties:3` → `defaults.project=android`. Or remove the property entirely (force CLI to fail loud rather than silently misroute).

### G2 — No `tracePropagationTargets` set anywhere [MEDIUM]

Search of source files: `grep tracePropagationTargets museum-{backend,frontend,web}/...` returns zero hits.

- **Mobile RN SDK 8**: default is `[/.*/]` (per `docs.sentry.io/platforms/react-native/tracing/trace-propagation/`). This means **every** fetch from the app injects `sentry-trace` + `baggage` headers — including calls to third-party CDNs (MapLibre tiles, image hosts). Not a leak — these headers contain only Sentry trace IDs (no PII), but they unnecessarily widen the trust surface.
- **Web Sentry Next.js**: default is `['localhost', /^\//]` (per Sentry JS docs). The Musaium web app proxies `/api/*` to the backend via `next.config.ts:28-34`. The same-origin default works for that path. Cross-origin fetches to absolute backend URLs would NOT propagate. Musaium does not appear to make cross-origin fetches from web client — needs verification.
- **Backend OTel**: `traceparent` (W3C) is the propagated header, not `sentry-trace`. Mobile + web SDKs send `sentry-trace` + `baggage` (Sentry-flavored), not `traceparent`. **Sentry's `SentryPropagator` is required** to bridge the two — but since BE uses `skipOpenTelemetrySetup: true` + `getDefaultIntegrationsWithoutPerformance()`, **`SentryPropagator` is not registered**.

**Impact**: trace tree breaks at the API boundary. Mobile/web Sentry sees client-side spans only; backend OTel sees server-side spans only. No correlation.

**Fix (cheap)**: explicit `tracePropagationTargets: ['^https://api.musaium\\.com/']` on web + mobile (avoid widening to all hosts). Document the deliberate gap: "trace tree is intentionally split — client = Sentry, server = OTel/Tempo".

**Fix (expensive — full correlation)**: re-enable Sentry's `httpIntegration` on the BE with `spans: false` + add `SentryPropagator` to the OTel SDK. This is documented for Next.js custom OTel setups. ([Sentry custom OTel — Node](https://docs.sentry.io/platforms/javascript/guides/node/opentelemetry/custom-setup/))

### G3 — Three duplicated scrubbers, manual sync, no ADR-045 [MEDIUM, technical debt]

All three scrubber files start with:
```ts
// SOURCE-OF-TRUTH: kept manually in sync with the 2 other scrubbers (BE/FE/Web).
// Cf docs/audit-cleanup-2026-05-12/ + ADR-045 (future extraction).
```

ADR-045 does not exist (`ls docs/adr/ADR-045*` returns nothing per repo scan in audit). Drift risk = real. A single regex tweak missed in one file silently breaks parity across apps.

**Email-hash inconsistency** already exists:
- BE: `createHash('sha256').update(email).digest('hex').slice(0, 8)` — cryptographic, irreversible.
- FE + Web: 32-bit fold (`Math.imul(hash ^ ...)`) — non-cryptographic, ~4 billion collision space.

The doc string on the FE acknowledges this is intentional ("not a cryptographic primitive; the value never leaves the client in raw form either way"). **Same email correlates differently** in Sentry between BE event and mobile event for the same user. Defeats the stated goal of cross-app correlation.

**Fix**: extract `packages/sentry-pii/` shared workspace package (already a pnpm workspace per `package.json`). Both hash impls should match — recommend `sha256(email).slice(0, 8)` in `@noble/hashes` (works in Node + RN + browser). Write ADR-045 explaining the consolidation.

### G4 — No `beforeSendTransaction` filter [LOW, cost]

None of the 3 apps drop health-check / static-asset / OPTIONS transactions at the SDK level. Sentry's Dynamic Sampling does this server-side on paid plans (Team $26/mo +), but pre-paid quota is still consumed by every dropped transaction sent. ([Sentry health check sampling](https://docs.sentry.io/organization/dynamic-sampling/))

At Musaium scale (~100k MAU, projected ~1.2M transactions/mo at 10% sampling), this is **not urgent**. Watch the Sentry dashboard once live and add a filter if needed:
```ts
beforeSendTransaction: (event) => {
  if (event.transaction?.includes('/health')) return null;
  return event;
}
```

### G5 — No `ignoreErrors` / `denyUrls` configured [LOW, noise]

None of the 3 apps configure `ignoreErrors` (e.g. `ResizeObserver loop`, `Non-Error promise rejection captured`) or `denyUrls` (`/^chrome-extension:\/\//`, `/^moz-extension:\/\//`). These are well-known noise sources documented by Sentry. ([Sentry filtering best practices](https://docs.sentry.io/platforms/javascript/configuration/filtering/))

**Most relevant for web** (browser extensions). Mobile has limited extension surface. BE is server-side, not affected.

**Fix (web only)**:
```ts
ignoreErrors: ['ResizeObserver loop limit exceeded', 'Non-Error promise rejection captured'],
denyUrls: [/^chrome-extension:\/\//, /^moz-extension:\/\//, /^safari-extension:\/\//],
```

### G6 — Sentry Replay opt-in decision not documented [LOW, future]

Replay is currently off everywhere. **Good default** for launch — PII risk vs. debugging value is tilted by:
- RN SDK 8.x masking has known iOS 26 (Liquid Glass) leak issues — open issue `getsentry/sentry-react-native#6390`. ([Sentry RN Replay privacy](https://docs.sentry.io/platforms/react-native/session-replay/privacy/))
- RN SDK Android Fabric/TurboModules: `maskAllText: false` is silently ignored — issue `#6122`.
- Web Replay quota counts separately ($0.30 per 1k replays on Team plan).

**Recommendation**: do NOT enable Replay for V1. If post-launch debugging demands it, enable on web first (more mature masking), iOS only when #6390 is patched.

---

## Cost optimization findings

### Current sample rates

| App | tracesSampleRate | profilesSampleRate | Notes |
|---|---|---|---|
| backend | `env.sentry.tracesSampleRate` (default 0.1) | `env.sentry.profilesSampleRate` (default 0) | Sentry traces are DISABLED via `skipOpenTelemetrySetup` — this rate has no effect for traces, only for spans Sentry might still create |
| mobile | 0.2 (hardcoded `sentry-init.ts:27`) | not set (default 0) | 0.2 = 20% — higher than web/BE; rationale not documented in code |
| web | 0.1 (hardcoded ×3 files) | not set | Aligns with Sentry baseline for 100k MAU ([Arancibia analysis](https://medium.com/@javierleandroarancibia/optimizing-sentrys-traces-sample-rate-for-production-front-end-projects-41a84e67dea7)) |

### Recommended baseline (per docs.sentry.io 2026 + R6 finding 8)

| App | Recommended tracesSampleRate | Why |
|---|---|---|
| backend | 0.05–0.1 (currently OK — but traces go to OTel not Sentry) | At 100k MAU, 5–10% gives statistically meaningful sample ([Sentry quotas](https://docs.sentry.io/pricing/quotas/manage-transaction-quota/)) |
| mobile | 0.1 (DROP from 0.2) | Mobile traffic is bursty; 20% wastes quota |
| web | 0.1 (current) | Keep |
| profilesSampleRate (all) | 0 in prod, 1.0 in staging | Profiling is expensive; sample only what you need |

**No documented rationale for mobile's 0.2** — likely a copy-paste from a sample config. **Action**: change to `0.1` or move to env (`EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`) per CLAUDE.md "no feature flags pre-launch" doctrine — env-driven, not flag-driven, OK.

---

## Trace propagation verdict

**Today (verified by source read)**: NO end-to-end trace continuity.

- Mobile fetch → backend: `sentry-trace` header IS injected (RN default `[/.*/]`), but backend OTel does not parse it (W3C `traceparent` only). Backend Sentry has `getDefaultIntegrationsWithoutPerformance()` → no `httpIntegration` to consume `sentry-trace`.
- Web fetch → backend: same — `sentry-trace` injected (default for same-origin `/api/*`), dropped at the BE boundary.
- Backend → LLM provider: OTel http instrumentation injects `traceparent`. OpenAI / Anthropic / Google APIs ignore it (no Sentry tracing on their side).
- Backend → Langfuse v3: standalone trace (per R6 finding §4), not nested under HTTP span.

**To fix the mobile/web → backend trace tree** (Sentry only, NOT OTel):
1. Add Sentry `httpIntegration({ spans: false })` to BE init.
2. Add `Sentry.setupExpressErrorHandler(app)` AFTER routes (already done at `sentry.ts:90-93`).
3. Add `SentryPropagator` to the OTel `NodeSDK` (one-line per docs).
4. The result: a single trace ID flows from mobile/web → BE → LLM, visible in Sentry's trace explorer; OTel/Tempo still gets server-side spans.

**Effort**: ~2h backend + ~30min mobile/web (set explicit `tracePropagationTargets`). Confirms the R6 architecture decision (Sentry as error pipeline, OTel as traces backbone) but adds the SentryPropagator bridge so client-side traces correlate.

---

## Alerts inventory

Grep across `docs/` finds **15 distinct alerts referenced but not yet provisioned in Sentry**:

| Alert | Source | Status |
|---|---|---|
| `compare_encoder_unavailable_total > 5/5min` | `docs/AI_VISUAL_SIMILARITY.md:65` | TBD T9.5 |
| `compare p95 > 3s sur 10min` | `docs/AI_VISUAL_SIMILARITY.md:75` | TBD T9.5 |
| `artwork_embeddings_count < 9000` | `docs/AI_VISUAL_SIMILARITY.md:90` | TBD T9.5 |
| Rate-limit fail-closed Redis flap | `docs/adr/ADR-011-rate-limit-fail-closed.md` | code emits event, no alert wired |
| LLM judge guardrail timeout | `docs/adr/ADR-015-llm-judge-guardrail-v2.md` | code emits, no alert wired |
| SSRF blocked spike | `docs/adr/ADR-006-ssrf-defense-in-depth.md` | TBD |
| Cert pinning mismatch | `docs/RUNBOOKS/CERT_ROTATION.md` | TBD |
| Breach playbook trigger | `docs/incidents/BREACH_PLAYBOOK.md:70` | TBD |
| GDPR breach 72h timer | `docs/compliance/SUBPROCESSORS.md:87` | wired via `breach-72h-timer.yml` workflow |

**Owner notification**: docs reference "Slack" generically. No `SLACK_WEBHOOK_URL` secret found in `.github/workflows/`. The Sentry → Slack integration is the recommended path ([Sentry Slack integration](https://docs.sentry.io/organization/integrations/notification-incidents/slack/)).

**Action**: Pre-launch checklist must include "create 9 alert rules in Sentry UI + wire Slack integration". This is V1 critical — alerts not wired = ops blind on launch day.

---

## Source maps verdict

| App | Wired? | Mechanism | Risk |
|---|---|---|---|
| backend | YES | `npx @sentry/cli sourcemaps upload` in `ci-cd-backend.yml:676` (deploy job) + 4 other call sites | Symbolicated stack traces in Sentry — verified |
| mobile | YES (auto via EAS) | `@sentry/react-native/expo` plugin in `app.config.ts:294-300` — uploads on EAS build per docs | Hermes-bundled JS symbolicated — verified by Sentry docs |
| web | YES (auto via bundler plugin) | `withSentryConfig` in `next.config.ts:37-43`, `sourcemaps.disable: !process.env.SENTRY_AUTH_TOKEN` | Production builds with the token upload; dev builds don't — correct gating |

**G1 caveat applies to mobile Android** — see Gap #1.

---

## Replay verdict

**NOT enabled in any of 3 apps.** Verified via `grep replayIntegration|replaysSessionSampleRate` returning 0 hits in BE/FE/Web source.

**Correct decision for V1**:
- RN Replay has open masking bugs (#6390 iOS 26 Liquid Glass, #6122 Android Fabric).
- Web Replay separate quota; cost not justified pre-revenue.
- BE is server-side, Replay does not apply.

**Re-evaluate post-launch** when (a) RN masking bugs are patched, (b) actual debugging value justifies cost (likely after first complex production incident where Replay would have helped).

---

## Sources

- [Sentry Custom OTel Setup — Node](https://docs.sentry.io/platforms/javascript/guides/node/opentelemetry/custom-setup/)
- [Sentry React Native Trace Propagation](https://docs.sentry.io/platforms/react-native/tracing/trace-propagation/)
- [Sentry React Native Automatic Instrumentation](https://docs.sentry.io/platforms/react-native/tracing/instrumentation/automatic-instrumentation/)
- [Sentry React Native Source Maps via Expo](https://docs.sentry.io/platforms/react-native/sourcemaps/uploading/expo/)
- [Sentry React Native Session Replay Privacy](https://docs.sentry.io/platforms/react-native/session-replay/privacy/)
- [Sentry React Native Profiling](https://docs.sentry.io/platforms/react-native/profiling/)
- [Sentry React Native Sensitive Data](https://docs.sentry.io/platforms/react-native/data-management/sensitive-data/)
- [Sentry Next.js OpenTelemetry Support](https://docs.sentry.io/platforms/javascript/guides/nextjs/opentelemetry/)
- [Sentry Next.js Custom OTel Setup](https://docs.sentry.io/platforms/javascript/guides/nextjs/opentelemetry/custom-setup/)
- [Sentry Next.js Sampling Configuration](https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/sampling/)
- [Sentry JavaScript Filtering / InboundFilters](https://docs.sentry.io/platforms/javascript/configuration/filtering/)
- [Sentry JavaScript Sensitive Data Scrubbing](https://docs.sentry.io/platforms/javascript/data-management/sensitive-data/)
- [Sentry Dynamic Sampling](https://docs.sentry.io/organization/dynamic-sampling/)
- [Sentry Slack Integration](https://docs.sentry.io/organization/integrations/notification-incidents/slack/)
- [Sentry Alert Routing With Integrations](https://docs.sentry.io/product/alerts/create-alerts/routing-alerts/)
- [Sentry Billing Quota Management](https://docs.sentry.io/pricing/quotas/)
- [Sentry Manage Transaction Quota](https://docs.sentry.io/pricing/quotas/manage-transaction-quota/)
- [Sentry AI/LLM Observability](https://sentry.io/solutions/ai-observability/)
- [Sentry Tuning for Frontend Performance — Telefónica Engineering](https://medium.com/@TelefonicaEng/tuning-sentry-for-frontend-performance-monitoring-c05a8093e86d)
- [Optimizing Sentry's traces sample rate — Arancibia](https://medium.com/@javierleandroarancibia/optimizing-sentrys-traces-sample-rate-for-production-front-end-projects-41a84e67dea7)

**Audit-internal cross-references**:
- `audit-2026-05-12/04-research/R6-observability.md` — backend observability stack, §3 Sentry, §1 OTel.
- `audit-2026-05-12/01-projects/web.md` — web Sentry findings, line 387.
- `audit-2026-05-12/04-research/R18-nextjs-perf-seo-i18n.md:333` — independent web Sentry tracesSampleRate finding.
- `audit-2026-05-12/01-projects/frontend.md:766` — R9 mobile tracesSampleRate 0.2 noisy.

---

## File paths verified

- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/src/shared/observability/sentry.ts`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/src/shared/observability/sentry-scrubber.ts`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/src/shared/observability/opentelemetry.ts`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/src/instrumentation.ts`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/src/config/env.ts` (lines 242-258)
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/src/index.ts` (line 32)
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/shared/observability/sentry-init.ts`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/shared/observability/sentry-scrubber.ts`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/app/_layout.tsx` (lines 48-54, 204)
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/app.config.ts` (lines 294-300)
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/eas.json` (lines 42-50)
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/ios/sentry.properties`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/android/sentry.properties` ← **G1 bug**
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-web/sentry.client.config.ts`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-web/sentry.server.config.ts`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-web/sentry.edge.config.ts`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-web/src/lib/sentry-scrubber.ts`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-web/src/instrumentation.ts`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-web/next.config.ts` (lines 37-43)
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/.github/workflows/ci-cd-backend.yml` (lines 656-676 + 4 other Sentry blocks)
