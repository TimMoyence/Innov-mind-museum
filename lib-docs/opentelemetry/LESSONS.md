# Lessons — opentelemetry (family v0.217.x)

Project-specific gotchas. Audit enterprise-grade 2026-05-18 : **COMPLIANT_WITH_KNOWN_DEBT**.

## ⚠️ 2026-05-18 — D1 MEDIUM : No sampler configured → 100% trace volume
- **Symptôme** : collector cost ↑ at scale (100k MAU target).
- **Cause** : `NodeSDK({...})` n'a pas de `sampler` passé. Default = AlwaysOnSampler. env.ts has no OTEL_TRACES_SAMPLER read.
- **Fix** : voir TD-OTEL-01. Either set ops env (`OTEL_TRACES_SAMPLER=parentbased_traceidratio + OTEL_TRACES_SAMPLER_ARG=0.1`) OR pass sampler explicitly to NodeSDK. Document choice in ADR.

## 2026-05-18 — D2 cross-ref : Sentry `tracePropagationTargets` absent (déjà TD-SN-01/TD-20)
- Pre-existing known debt, NOT introduced by this audit.

## 2026-05-18 — D3 INFO : No manual business spans via `@opentelemetry/api`
- **Cause** : zero hits pour `tracer.startActiveSpan`/`getTracer`/`@opentelemetry/api`. Custom tracing via Langfuse SDK (chat-phase-span.ts via safeTrace wrapper).
- **Status** : architectural choice intentional — business obs via Langfuse, infra via OTel auto-instrument. Cross-tool correlation requires manual trace-id bridging (e.g. inject `langfuse.trace_id` as OTel span attribute).

## 2026-05-18 — Configuration exemplaire (13 PASS)
- ✅ `instrumentation` FIRST import in `index.ts:1`
- ✅ `resourceFromAttributes()` factory v2.0 (NOT `new Resource()`)
- ✅ `ATTR_SERVICE_NAME` + `ATTR_SERVICE_VERSION` from semantic-conventions (not string literals)
- ✅ router instrumentation DISABLED (defensive : v0.75.0 bundle ne ship plus router, mais gotcha CLAUDE.md reste)
- ✅ fs + dns instrumentations disabled (noise reduction)
- ✅ OTLP exporter env-sourced + correct `/v1/traces` suffix
- ✅ Service.name + service.version from env
- ✅ BatchSpanProcessor (default, NOT SimpleSpanProcessor)
- ✅ W3C TraceContext + Baggage propagators (default post-v2.0)
- ✅ Sentry+OTel bridge `skipOpenTelemetrySetup` + `getDefaultIntegrationsWithoutPerformance` (ADR-045)
- ✅ shutdown handler wired (`shutdownOpenTelemetry` index.ts:45,260)
- ✅ Conditional load via require() preserves cold-start when OTEL_ENABLED=false

## 2026-05-18 — Anti-patterns à éviter
- ❌ `new Resource({...})` (use `resourceFromAttributes()`)
- ❌ String literal attribute keys (use ATTR_* constants)
- ❌ SimpleSpanProcessor en prod (use BatchSpanProcessor default)
- ❌ Re-enable `@opentelemetry/instrumentation-router` sans audit Express middleware count

## 2026-05-20 — Refresh delta (doc-curator UFR-022)

### D4 SECURITY (HIGH, NOT EXPOSED) — GHSA-q7rr-3cgh-j5r3 Prometheus exporter process crash
- **CVSS 7.5 HIGH**, published 2026-05-06 by upstream. Network-based, no auth.
- **Affected** : `@opentelemetry/exporter-prometheus < 0.217.0`, `@opentelemetry/sdk-node < 0.217.0`, `@opentelemetry/auto-instrumentations-node < 0.75.0`.
- **Musaium pin** : `^0.217.0` and `^0.75.0` — at the patched floor. Not exposed.
- **TD-31 implication** : when migrating `prom-client` → `@opentelemetry/exporter-prometheus`, pin `>=0.217.0` minimum. Add this to TD-31 acceptance criteria so the doc-fetcher catches it on next refresh.
- **Root cause** : Prometheus exporter request handler lacked URL parse error handling; literal `"http://"` triggered uncaught `TypeError`. Mitigation if you can't bump : restrict exporter host to `127.0.0.1` + firewall :9464.

### D5 INFO — `instrumentation-router` NOT in v0.76.0 bundle (confirmed against contrib README)
- Disable entry at `museum-backend/src/shared/observability/opentelemetry.ts:48` is a **defensive no-op** (key isn't read).
- **DO NOT REMOVE** the entry — it's load-bearing documentation of the gotcha (`reference_otel_router_max_listeners` memory). The comment block opentelemetry.ts:43-47 catches anyone who tries to add the contrib package back later (separate `instrumentation-router` npm exists at v0.62.0 as of 2026-05-13).
- If a future Renovate PR removes the entry citing "dead config", REJECT.

### D6 LOW — Available bumps (non-urgent)
- `@opentelemetry/api`        ^1.9.0   → 1.9.1   (patch — no API change)
- `@opentelemetry/resources`  ^2.7.0   → 2.7.1   (patch — trace-state validation fix)
- `@opentelemetry/sdk-node`   ^0.217.0 → 0.218.0 (minor — OTLP metrics serializer rewrite; experimental track ⇒ treat like major)
- `@opentelemetry/exporter-trace-otlp-http` ^0.217.0 → 0.218.0 (minor — OTLP serializer rewrite)
- `@opentelemetry/auto-instrumentations-node` ^0.75.0 → 0.76.0 (minor — deps only)
- `@opentelemetry/semantic-conventions` ^1.40.0 → 1.41.1 (minor — adds GenAI namespace, **1.41.0 yanked**)
- **Recommendation** : let Renovate batch them at next cycle. No emergency. Bumping minor on experimental track requires smoke test (`pnpm dev`, hit a few endpoints, check Tempo receives spans).

### D7 INFO — GHSA-f8pq-3926-8gx5 (2023-08-09) historical only
- Pre-dates current pins by 3 years. Out of scope. Mentioned for completeness only.

### D8 STILL OPEN — D1 sampler not configured (TD-OTEL-01)
- Re-confirmed 2026-05-20 : `museum-backend/src/shared/observability/opentelemetry.ts:36-51` `new NodeSDK({...})` has no `sampler` field; env `OTEL_TRACES_SAMPLER` is not read in `env.ts`. Default `AlwaysOnSampler` keeps 100 % of traces.
- Not urgent pre-V1 (low traffic). At 100k MAU target it saturates the collector — set `OTEL_TRACES_SAMPLER=parentbased_traceidratio` + `OTEL_TRACES_SAMPLER_ARG=0.1` in prod ops env when scaling.

### D9 STILL OPEN — D3 no manual business spans
- Re-confirmed 2026-05-20 : only `@opentelemetry/api` import in `museum-backend/src` is `trace-propagation.middleware.ts:25` (read-side `trace.getActiveSpan()`). Zero `tracer.startActiveSpan` / `getTracer` usage.
- Architectural choice (Langfuse for business obs, OTel for infra) — informational, not a defect.

### D10 PATTERN — `OTEL_EXPORTER_ENDPOINT` is the base, not the full URL
- `opentelemetry.ts:33` concatenates `/v1/traces` in code. If ops sets `OTEL_EXPORTER_ENDPOINT=http://collector:4318/v1/traces` (full path), the SDK exports to `…/v1/traces/v1/traces` → 404 silent drop.
- Document this in the env example file or wrap with a sanity check (strip trailing `/v1/traces` if present).

## 2026-05-20 — Configuration audit refresh (all 2026-05-18 PASS still hold)
- ✅ `instrumentation.ts` FIRST import (`index.ts:1` — verified again).
- ✅ Sentry init before OTel (`instrumentation.ts:15-16`).
- ✅ `resourceFromAttributes()` factory (opentelemetry.ts:27).
- ✅ `ATTR_SERVICE_NAME` + `ATTR_SERVICE_VERSION` from semantic-conventions (opentelemetry.ts:23-25).
- ✅ fs + dns + router defensively disabled (opentelemetry.ts:41-48).
- ✅ OTLP HTTP exporter (no transport mixing).
- ✅ BatchSpanProcessor (default, not SimpleSpanProcessor).
- ✅ W3C TraceContext + Baggage propagators (post-v2.0 default).
- ✅ Sentry+OTel `skipOpenTelemetrySetup` + `getDefaultIntegrationsWithoutPerformance` (sentry.ts:52-53, ADR-045).
- ✅ Shutdown handler wired (`shutdownOpenTelemetry` index.ts:273).
- ✅ Conditional load preserves cold-start when `OTEL_ENABLED=false`.

**Audit verdict 2026-05-20** : COMPLIANT_WITH_KNOWN_DEBT (unchanged from 2026-05-18 ; D1/D2/D3 still open, no new findings).
