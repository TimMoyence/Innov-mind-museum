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
