# Distributed tracing — FE ↔ BE

> **Status:** wire-up shipped 2026-05-17 (W4 cluster B, TB3 / W6.9).
> **Owner:** observability.
> **Scope:** mobile FE (`museum-frontend`) outbound HTTP → BE (`museum-backend`) inbound HTTP. Web FE (`museum-web`) follow-up tracked separately.

---

## 1. Goal

When a user issues a chat request from the mobile app, the latency budget is consumed across at least three systems: the device's JavaScript runtime (rendering + serialization), the BE API gateway (auth, rate-limit, validation), and the LLM orchestrator (provider HTTP, cache lookup, guardrail). Without a correlated trace, an investigator looking at a slow chat needs to grep three separate log streams and reassemble the timeline manually.

After this wire-up, a single trace ID links the FE-emitted Sentry span to the BE OTel span, and both surface in Langfuse + Grafana with the same `parent.trace_id` attribute. Investigation goes from "minutes of cross-grep" to "one click".

## 2. Architecture

```
┌──────────────────────────┐   sentry-trace + baggage headers   ┌──────────────────────────┐
│ museum-frontend (RN)     │  ───────────────────────────────►  │ museum-backend (Express) │
│                          │                                    │                          │
│ Sentry SDK               │                                    │ trace-propagation        │
│ tracePropagationTargets  │                                    │   .middleware.ts         │
│ stamps headers on        │                                    │ reads headers, attaches  │
│ outbound fetch           │                                    │ as span attributes       │
└──────────────────────────┘                                    └──────────────────────────┘
                                                                              │
                                                                              ▼
                                                                ┌──────────────────────────┐
                                                                │ OTel SDK (instrumentation-│
                                                                │  http auto-extracts W3C   │
                                                                │  traceparent)             │
                                                                │  → exports OTLP to        │
                                                                │  collector → Grafana      │
                                                                │  Tempo + Langfuse         │
                                                                └──────────────────────────┘
```

## 3. FE side — Sentry `tracePropagationTargets`

File: [`museum-frontend/shared/observability/sentry-init.ts`](../../museum-frontend/shared/observability/sentry-init.ts).

```ts
const tracePropagationTargets: RegExp[] = [
  /^https:\/\/api\.musaium\.com\//,
  /^https?:\/\/[^/]+\/api\//, // local dev
];

Sentry.init({
  ...,
  tracePropagationTargets,
  ...
});
```

Effect: Sentry's auto-fetch-instrumentation injects `sentry-trace` + `baggage` headers on outbound `fetch` calls whose URL matches one of the patterns. URLs that don't match (third-party APIs, image hosts, Cloudflare CDN) are NOT stamped, preventing trace ID leakage.

Both header names are also explicitly allowed by the BE CORS config ([`museum-backend/src/app.ts`](../../museum-backend/src/app.ts) `allowedHeaders`) so they survive preflight in production.

## 4. BE side — propagation middleware

File: [`museum-backend/src/shared/observability/trace-propagation.middleware.ts`](../../museum-backend/src/shared/observability/trace-propagation.middleware.ts).

Reads `sentry-trace` (Sentry format `trace_id-span_id-sampled`) and `baggage` on every incoming request, attaches them to the active OTel span as attributes:

- `musaium.parent.trace_id`
- `musaium.parent.span_id`
- `musaium.parent.sampled`
- `musaium.parent.baggage` (truncated to 1 KB to avoid pathological payloads)

Fail-open: if headers absent / malformed / no active span, middleware is a no-op. Never throws.

### Why attributes and not a full propagator

Per ADR-045 we run Sentry as **errors + breadcrumbs only**, with `skipOpenTelemetrySetup: true` — the OTel SDK is the sole tracer. Wiring a Sentry-OTel propagator would re-introduce the duplicate-span issue (~21 finish spans per request) we explicitly disabled. Surfacing the parent trace ID as span attributes is the cheapest correlation primitive: Grafana span-link feature pivots on attribute filters, Langfuse session search can match on `musaium.parent.trace_id`, no SDK collision.

A full W3C propagator (read `traceparent`, set OTel context) is already provided by `@opentelemetry/instrumentation-http` for the W3C-shaped header — Sentry RN >= 5.x stamps both `sentry-trace` (Sentry-shaped) and `traceparent` (W3C-shaped) when its tracing integration is active, so the W3C path also works automatically.

## 5. Wiring the middleware

The middleware is exported but not yet mounted in [`museum-backend/src/app.ts`](../../museum-backend/src/app.ts). To activate, add after `requestIdMiddleware`:

```ts
import { traceePropagationMiddleware } from '@shared/observability/trace-propagation.middleware';
// ...
app.use(requestIdMiddleware);
app.use(requestLoggerMiddleware);
app.use(traceePropagationMiddleware);  // ← W4 W6.9
```

Ordering matters: the middleware needs the OTel span to already exist (created by `instrumentation-http` automatically). Mounting after `cors` is fine; mounting before `helmet` is fine.

## 6. Verification

### 6.1 Local dev round-trip

```bash
# 1. boot the local stack
cd museum-backend && docker compose -f docker-compose.dev.yml up -d
pnpm dev   # backend on :3000

# 2. install ngrok or use a LAN IP for the mobile app to reach :3000
# 3. boot the mobile app pointing at that URL
cd museum-frontend && npm run dev:local

# 4. send a chat request from the mobile app
# 5. tail the backend logs — expect:
#    request_id=<id> sentry-trace=<32hex>-<16hex>-1 baggage=<...>
```

The trace ID should also appear in Langfuse `Traces` UI under the request session.

### 6.2 Grafana Tempo query

```
{ span.musaium.parent.trace_id = "<the 32-hex trace id>" }
```

Should return a span for the BE handler with the parent linked.

### 6.3 Sentry events round-trip

Trigger a deliberate FE error inside a chat session (e.g. `throw new Error('FE smoke')` from the chat screen) — the Sentry event should include the `trace_id` matching the BE log line above.

## 7. Known limits

- **`museum-web` (admin) not yet wired.** Web Sentry init lacks `tracePropagationTargets`. Tracked as TD-47.
- **OTel sampler** — sampler is currently `AlwaysOn` per ADR-045; flip to a head-based sampler when scale demands it.
- **Baggage validation** — we attach the baggage string raw (truncated). If a malicious FE injects W3C-invalid baggage, the BE will store the noise as a span attribute. Cardinality risk is bounded by the 1 KB truncation, but a validator step is a hardening follow-up (TD-48).

## 8. References

- ADR-045 — Sentry+OTel coexistence (`skipOpenTelemetrySetup: true`, getDefaultIntegrationsWithoutPerformance).
- Sentry SDK trace propagation: https://docs.sentry.io/platforms/javascript/tracing/trace-propagation/
- W3C Trace Context spec: https://www.w3.org/TR/trace-context/
- OTel HTTP instrumentation: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-http
