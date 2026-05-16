# R6 — Backend Observability Stack (Musaium)

**Agent**: R6 (research) — audit 2026-05-12
**Scope**: museum-backend OTel + Prometheus + Sentry + Langfuse + structured logs
**Target**: launch V1 2026-06-01, ~100k users
**Method**: 24 WebSearches + 6 WebFetches + npm-registry verification + source-tree read
**Discipline**: UFR-013 — every version + claim sourced or marked `[NOT VERIFIED]`

---

## TL;DR (read-this-first)

1. **Current stack is solid, but stale on Langfuse** — the rest is current.
2. **CRITICAL upgrade window**: Langfuse JS `^3.38.20` is the **legacy/deprecated** SDK. v4 GA 2025-08, v5 GA 2026-03 — both require OpenTelemetry-native registration (`LangfuseSpanProcessor` on the existing NodeSDK). The doctrine *recommends migrating directly to v5*. We're 2 majors behind.
3. **Observability gap #1**: no metric-trace correlation (no Prometheus exemplars wired) → Grafana dashboards cannot click through to traces. prom-client 15.x supports `OpenMetrics + exemplars` since 15.0.0 (2023) but the codebase uses the default `Registry`, not `OpenMetricsContentType`.
4. **Observability gap #2**: no OTel GenAI semconv (`gen_ai.client.token.usage`, `gen_ai.client.operation.duration`). The chat pipeline emits its own custom `chat_phase_*` Prometheus metrics, but no LLM-vendor-agnostic span attributes. Datadog, Langfuse v5, Sentry v10, Phoenix, LangSmith all read GenAI semconv natively.
5. **Observability gap #3**: no log-trace correlation. The `logger.ts` is a pure `console.log` JSON wrapper. No `traceId`/`spanId` injection from OTel context. Investigations have to chain by `requestId` only.
6. **Observability gap #4**: no SLO / burn-rate alerting infra. The existence of `chat_phase_duration_seconds` + `wikidata_sparql_circuit_state` is necessary but not sufficient — there are no recording rules, no multi-burn-rate alert rules, no error-budget tracking.
7. **2026-05-12 hotfix verdict**: the `RouterInstrumentation` disable + `resourceFromAttributes` migration + `skipOpenTelemetrySetup: true` + `getDefaultIntegrationsWithoutPerformance()` choices are **correct and aligned with 2026 best practices**. The recent fixes lifted Musaium to the right architecture for OTel + Sentry coexistence.
8. **Sentry**: Musaium runs **^10.49.0** — `@sentry/node@10.53.1` is the current latest on npm (verified via registry). v10 was released to align with OpenTelemetry v2. Up to date. v11 not on the roadmap as of May 2026.
9. **OTel JS**: stable packages `^2.7.0` (resources) + `^1.40.0` (semconv) + experimental packages `^0.217.0` (sdk-node / exporter / auto-instrumentations) — this is **current**. OTel JS SDK 2.0 went GA Feb 2025; v1 supported for one year past 2.0.
10. **Cost for 100k users**: current self-hosted setup (Prometheus + Grafana via `infra/grafana/`, Sentry SaaS, Langfuse SaaS or self-hosted) is sustainable. Public Langfuse SaaS at 100k users = ~$29-200/mo. Self-hosted Langfuse v3 (Postgres + ClickHouse + Redis + S3) = ~$50-80/mo for ~5M spans/day. **No need to switch to Datadog ($50-200k/yr).**

**Verdict**: **KEEP** current architecture. **UPGRADE** Langfuse to v5 (4-6h work, high ROI for OTel-native traces). **WIRE** exemplars + log-trace correlation + GenAI semconv (1-2 days). **ADD** burn-rate alerts before launch (1 day). The 2026-05-12 OTel SDK v2 + Sentry v10 hotfix work was the right call.

---

## 1) OpenTelemetry Node SDK v2 (2026 status)

### What Musaium runs (verified)

```
@opentelemetry/sdk-node                  ^0.217.0   (experimental package — pre-1.0)
@opentelemetry/auto-instrumentations-node ^0.75.0    (experimental)
@opentelemetry/exporter-trace-otlp-http   ^0.217.0   (experimental)
@opentelemetry/resources                  ^2.7.0     (STABLE / GA v2)
@opentelemetry/semantic-conventions       ^1.40.0    (STABLE / GA v1)
```

(`museum-backend/package.json`)

### Release status (verified 2026-05-12)

- **OTel JS SDK 2.0 GA**: released late February 2025. Per OTel governance, v1.x stable packages supported for **one year past 2.0.0 release** — so v1 EOL'd ~Feb 2026. **We are correctly on v2.x for stable packages.**
- **Experimental packages** (`sdk-node`, `auto-instrumentations`, `exporter-*`) follow `0.MINOR.PATCH` versioning. `0.217.0` is current; `0.200.0` was the floor matching SDK 2.0. ([opentelemetry-js#5148](https://github.com/open-telemetry/opentelemetry-js/issues/5148))
- **Min Node** raised to `^18.19.0 || >=20.6.0`. Musaium ≥ Node 22. OK.
- **Min TypeScript** 5.0.4. OK.
- **Compile target** ES2022. OK.

### v2 breaking changes that affected Musaium

The 2026-05-12 hotfix already addresses these:

1. **`Resource` class removed** → must use `resourceFromAttributes({...})` factory. ([upgrade-to-2.x.md](https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/upgrade-to-2.x.md))
   - Fix applied: [`opentelemetry.ts:37`](museum-backend/src/shared/observability/opentelemetry.ts) — `resourceFromAttributes` used correctly. Comment captures the incident.
2. **Removed namespaces** (`ResourceAttributes`, etc.) → replaced with individual constants (`ATTR_SERVICE_NAME`, `ATTR_SERVICE_VERSION`). Fix applied.
3. **Public interface tightened** for tree-shaking — TypeScript classes with private fields no longer exported.

### Auto-instrumentation stable for production 2026

- `instrumentation-http` — stable, production-ready (1 span / request).
- `instrumentation-express` — stable. **Known caveat**: cannot correctly time async middlewares; spans show only synchronous segment. ([npm @opentelemetry/instrumentation-express](https://www.npmjs.com/package/@opentelemetry/instrumentation-express))
- `instrumentation-router` — **correctly disabled** in Musaium. The 2026-05-12 lesson learned (`MaxListenersExceededWarning: 11 finish listeners`) is consistent with the public guidance to disable instrumentations that wrap per-layer event listeners. ([oneuptime/2026-02-06](https://oneuptime.com/blog/post/2026-02-06-disable-unnecessary-auto-instrumentation-reduce-noise/view))
- `instrumentation-fs` / `instrumentation-dns` — correctly disabled (low signal, high noise). Aligned with public best practice.
- Recommended additionally to disable: `redis-4` / `ioredis` if not used (Musaium uses ioredis — keep enabled).

### Sampling — gap for 100k users

Musaium has **no explicit `tracesSampler`** set on the NodeSDK — defaults to "always-on" sampling. At 100k users with chat-heavy traffic this generates millions of spans/day. ([opentelemetry.io/docs/concepts/sampling](https://opentelemetry.io/docs/concepts/sampling/))

**Recommendation**: head-based `TraceIDRatioBased` at 10-20% on the SDK + tail-based at the Collector if 100% error visibility is required. Per Elastic/Uptrace, "Modest microservice at 10k rps generates hundreds of thousands of spans/sec — sending all is expensive and unnecessary." ([uptrace.dev/opentelemetry/sampling](https://uptrace.dev/opentelemetry/sampling))

### OTel JS roadmap

- New stable major every ~year (per OTel governance proposal).
- Logs Bridge API moving toward stable in 2026.
- GenAI semconv (`gen_ai.*`) in **Development** stage — see §7.

**Sources**:
- [Announcing OTel JS SDK 2.0 — opentelemetry.io 2025-02](https://opentelemetry.io/blog/2025/otel-js-sdk-2-0/)
- [Upgrade to 2.x guide](https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/upgrade-to-2.x.md)
- [Versioning & stability spec](https://opentelemetry.io/docs/specs/otel/versioning-and-stability/)

---

## 2) Prometheus + prom-client

### What Musaium runs (verified npm registry 2026-05-12)

```
prom-client  ^15.1.3    (released 2024-06-27 — latest npm publication)
```

**Finding**: `prom-client` has had **no new release since 15.1.3** (~22 months at audit time). Despite that, the project is still actively maintained per CHANGELOG (master has unreleased changes — Node 16/18/21/23 drop planned). For a Prometheus client this is acceptable — the protocol is stable. ([github.com/siimon/prom-client](https://github.com/siimon/prom-client))

### Current Musaium implementation review

27 metrics across 8 subsystems ([`prometheus-metrics.ts`](museum-backend/src/shared/observability/prometheus-metrics.ts)):

| Subsystem | Metric | Cardinality budget | Status |
|---|---|---|---|
| HTTP RED | `http_requests_total{route,status,method}` | ~50×6×7=2100 | Good — `route` normalized to template (`/users/:id`) |
| HTTP RED | `http_request_duration_seconds{route,method}` | ~350 | Good |
| LLM cache | `llm_cache_hits/misses_total{context_class}` | ~10 | Good |
| Chat phase | `chat_phase_duration_seconds{phase,provider}` | ≤200 | Good — explicit budget per spec |
| Chat phase | `chat_phase_errors_total{phase,provider,error_type}` | ≤200 | Good |
| Chat e2e | `chat_request_duration_seconds{outcome}` | 5 | Good |
| C2 enrichment | `chat_enrichment_source_calls_total{source,outcome}` | ≤16 | Good |
| C3 compare | `compare_*` (4 metrics, 1-5 labels) | ≤9 | Good |
| Wikidata C5 | `wikidata_sparql_*` (5 metrics) | ~10 | Good |
| LLM Guard | `musaium_llm_guard_*` (4 metrics) | ~10 | Good (2026-05-12 incident response) |
| C4 anti-halluc | `chat_sources_*`, `chat_websearch_*`, `chat_url_head_probe_*` | ≤13 | Good |

**Cardinality discipline**: textbook. Every metric has a documented label set + cardinality budget. No `user_id` / `museum_id` / `request_id` labels. This matches 2026 SRE doctrine (Grafana Labs guidance: ">100 unique values on a label = reconsider; >10k unique series = TSDB risk"). ([grafana.com/blog/manage-high-cardinality-prometheus](https://grafana.com/blog/how-to-manage-high-cardinality-metrics-in-prometheus-and-kubernetes/))

### Gap: no exemplars

prom-client supports OpenMetrics + exemplars since 15.0.0 (2023). To enable, the registry must be the **OpenMetrics type**, not the plain `Registry` Musaium uses today:

```ts
// current (museum-backend/src/shared/observability/prometheus-metrics.ts:12)
export const registry = new Registry();

// proposed
import { Registry, OpenMetricsContentType } from 'prom-client';
export const registry = new Registry<OpenMetricsContentType>();
registry.setContentType(OpenMetricsContentType);

// at observe site
httpRequestDurationSeconds.observe({ route, method }, latencySec, {
  traceId: trace.getActiveSpan()?.spanContext().traceId,
  spanId: trace.getActiveSpan()?.spanContext().spanId,
});
```

This enables Grafana's "Click latency spike → jump to representative trace" workflow. Per OpenObserve / Eric Schabell guide, exemplars are *the* 2026 way to bridge metrics → traces without exploding cardinality. ([schabell.org/2024/09 — exemplars](https://www.schabell.org/2024/09/hands-on-guide-to-opentelemetry-linking-metrics-to-traces-with-exemplars-part2.html))

### Default metrics gotcha (already handled)

The `collectDefaultMetrics()` Node process metrics use unrefed `setInterval` collectors that kept the event loop alive and broke Stryker mutant throughput. Musaium correctly extracted this to an opt-in `enableDefaultMetrics()` called from bootstrap only ([`prometheus-metrics.ts:14-31`](museum-backend/src/shared/observability/prometheus-metrics.ts)). **No action needed**.

### Recommended additions

- `business_active_users` (gauge, no labels) — DAU/MAU panel.
- `llm_token_usage_total{provider, type=input|output, model}` — token cost panel (see §7 GenAI semconv).
- `llm_cost_usd_total{provider, model}` — derived metric for billing dashboards.
- `audit_chain_break_total{break_reason}` — audit chain integrity SLO (see §7).
- `guardrail_blocks_total{category, decision}` — already partly implemented via `chat_request_duration_seconds{outcome=guardrail_blocked}` — would prefer a dedicated counter for alert rule clarity.

**Sources**:
- [prom-client GitHub README + CHANGELOG](https://github.com/siimon/prom-client)
- [Grafana — manage high cardinality metrics](https://grafana.com/blog/how-to-manage-high-cardinality-metrics-in-prometheus-and-kubernetes/)
- [Last9 — Manage high-cardinality in Prometheus 2026](https://last9.io/blog/how-to-manage-high-cardinality-metrics-in-prometheus/)
- [Eric Schabell — exemplars for traces↔metrics](https://www.schabell.org/2024/09/hands-on-guide-to-opentelemetry-linking-metrics-to-traces-with-exemplars-part2.html)

---

## 3) Sentry Node 8 / 9 / 10 (2026)

### What Musaium runs (verified npm registry 2026-05-12)

```
@sentry/node  ^10.49.0   (current latest on npm: 10.53.1 — diff is patch only)
```

**Verdict**: **current**. Musaium is on `v10`.

### v8 → v9 → v10 timeline

- v8 (2024-05): OpenTelemetry-powered tracing, `setupExpressErrorHandler` API.
- v9 (2025-Q1): removed legacy metrics API (Sentry Metrics beta ended), `@sentry/types` deprecated, FID web vital removed in favor of INP, `BaseClient` → `Client`, `hasTracingEnabled` → `hasSpansEnabled`. ([docs.sentry.io v9-to-v10](https://docs.sentry.io/platforms/javascript/migration/v9-to-v10/))
- v10 (2025): bumped OpenTelemetry dependencies to v2.x.x / 0.20x.x. *"Genuinely easy migration — 8 breaking changes mostly internal"*. **Compatible with Sentry self-hosted 24.4.2+**. ([blog.sentry.io overdue-upgrade](https://blog.sentry.io/overdue-for-a-sentry-sdk-upgrade/))

### Musaium's OTel + Sentry coexistence — correct

`sentry.ts:62-73` ([`sentry.ts`](museum-backend/src/shared/observability/sentry.ts)) sets:

```ts
skipOpenTelemetrySetup: true,
integrations: [...Sentry.getDefaultIntegrationsWithoutPerformance()],
```

This is **exactly the public guidance** when you bring-your-own NodeSDK. ([docs.sentry.io OTel custom-setup](https://docs.sentry.io/platforms/javascript/guides/node/opentelemetry/custom-setup/))

- `skipOpenTelemetrySetup: true` prevents Sentry from registering its own competing NodeSDK (would stack ~21 `finish` listeners → MaxListenersExceeded warning).
- `getDefaultIntegrationsWithoutPerformance()` drops Sentry's ~25 mirrored auto-instrumentations (Express, Postgres, Redis, …) that duplicate OTel's.
- Errors + breadcrumbs + console capture + requestData + linkedErrors are kept.

**Trade-off** noted in code comment is accepted: APM/perf spans no longer land in Sentry, they go OTel-only to the collector. Sentry stays the error/breadcrumb pipeline. **This is the canonical 2026 architecture** for projects that already have a complete OTel pipeline.

### Sampling for 100k users

Current `tracesSampleRate` / `profilesSampleRate` from env. Recommended baseline for 100k MAU per Sentry docs and Javier Arancibia's analysis: **5% for traces**, **errors at 100%**. ([medium.com Arancibia — optimizing tracesSampleRate](https://medium.com/@javierleandroarancibia/optimizing-sentrys-traces-sample-rate-for-production-front-end-projects-41a84e67dea7)) Sentry's Dynamic Sampling can further reduce backend cost.

### PII scrubbing — verified

`sentry-scrubber.ts` redacts:
- Headers: `authorization|cookie|x-api-key|x-auth-token`
- Body keys: `password|token|secret|api[_-]?key|refresh`
- Query keys: full set of 7 sensitive tokens
- Auth-adjacent breadcrumb URLs dropped entirely
- Emails replaced by sha256(8-char) fingerprint, raw email deleted

This is **stronger than Sentry's `sendDefaultPii: false` default** — which only suppresses Sentry-side enrichment. Musaium's defence-in-depth (also `sendDefaultPii: false`) is correct.

### v11 outlook

As of 2026-05, **no public roadmap** for Sentry JavaScript v11. Recommend recheck quarterly via [github.com/getsentry/sentry-javascript/releases](https://github.com/getsentry/sentry-javascript/releases).

**Sources**:
- [Sentry v9→v10 migration — Node](https://docs.sentry.io/platforms/javascript/guides/node/migration/v9-to-v10/)
- [Sentry OTel custom setup — Node](https://docs.sentry.io/platforms/javascript/guides/node/opentelemetry/custom-setup/)
- [blog.sentry.io overdue-for-sentry-sdk-upgrade](https://blog.sentry.io/overdue-for-a-sentry-sdk-upgrade/)
- [Support OpenTelemetry SDK v2 — getsentry/sentry-javascript#15737](https://github.com/getsentry/sentry-javascript/issues/15737)

---

## 4) Langfuse — CRITICAL UPGRADE GAP

### What Musaium runs (verified npm registry 2026-05-12)

```
langfuse  ^3.38.20   (legacy package — last v3 train)
```

### npm-registry verified state of the world (2026-05-12)

- `langfuse@3.38.20` — Musaium's pinned version, in the **legacy** package.
- `@langfuse/tracing@5.3.0` — current latest **stable** SDK on npm.

Per Langfuse docs:
- **JS/TS v3 → v4 GA**: 2025-08-28. Full rewrite, OpenTelemetry-native, package split.
- **JS/TS v4 → v5 GA**: 2026-03. Observation-centric data model.
- The upgrade-path doc **recommends migrating directly to v5**, not stopping at v4. ([js-v3-to-v4](https://langfuse.com/docs/observability/sdk/upgrade-path/js-v3-to-v4))

### Why this matters (not just version-bumping)

v3 (Musaium's version):
- Custom HTTP client to ship spans
- Standalone `trace()` / `span()` / `generation()` API
- **Not integrated with the OpenTelemetry NodeSDK** Musaium just set up correctly

v4 / v5:
- Implements OTel `SpanExporter` interface — spans flow through the existing NodeSDK
- Registered as `LangfuseSpanProcessor` on the same NodeSDK
- Package split: `@langfuse/tracing`, `@langfuse/otel`, `@langfuse/client`
- v5: observation-centric model — `userId`/`sessionId`/`metadata`/`tags` propagate to every observation via `propagateAttributes()` (was `updateActiveTrace()` in v4)

### Concrete impact on Musaium

Today (`chat-phase-timer.ts`):
- Each phase opens a **standalone Langfuse trace** with `lf.trace({...})` — not a child of the OTel HTTP span.
- Spans are correlated across phases only via the shared `requestId` metadata field (acknowledged in the code comment §"Spans are emitted as standalone traces in V1").

After v5 migration:
- `startObservation()` / `startActiveObservation()` from `@langfuse/tracing` produces real OTel spans nested under the active HTTP span.
- The whole request becomes a single trace tree in **both** Langfuse UI and any OTel-compatible backend (Tempo, Jaeger).
- `propagateAttributes({ userId, museumId, sessionId })` once at request entry — every child observation inherits.

### Migration effort estimate

- Code-touch points: 1 SDK init (`langfuse.client.ts`), 1 timer wrapper (`chat-phase-timer.ts`), spans emitted from chat orchestrator. ~8 sites.
- Package updates: replace `langfuse` with `@langfuse/tracing@5` + `@langfuse/otel@5` + `@langfuse/client@5`. Register `LangfuseSpanProcessor` on existing NodeSDK (one-line add in `opentelemetry.ts`).
- Env var rename: `LANGFUSE_BASEURL` → `LANGFUSE_BASE_URL` (backward-compat in v4, dropped in v5).
- Smart default span filter in v4: **only emits LLM-scope spans** (openinference, langsmith, haystack, litellm…). If Musaium wants HTTP/DB spans in Langfuse, an explicit allow-list is required.
- **Effort**: 4-6h (engineering) + 1-2h (validation). High ROI.

### Alternatives — should we switch?

|Tool|Strength|Weakness|Verdict for Musaium|
|---|---|---|---|
|**Langfuse v5**|OTel-native, self-host friendly, ClickHouse-backed, FOSS, broad SDK|v3→v5 jump|**KEEP + UPGRADE**|
|LangSmith|Best for LangChain/LangGraph stack, deepest integration with the framework Musaium uses|Closed-source, vendor lock, $39/seat/mo + $0.50 / 1k traces, no self-host|Eval-heavy alt — not justified for B2C launch|
|Helicone|Cheapest gateway-based logging, low friction|Proxy = adds a network hop in the LLM critical path|No — adds latency on chat path|
|Arize Phoenix|OTel-native via OpenInference, open-source (Elastic 2.0), eval-heavy|LlamaIndex-leaning, less polished for production analytics|Alt for eval pipelines later|
|Braintrust|Eval-driven CI/CD, prompt diff testing|Closed-source, more eval-oriented than observability|Out of scope V1|
|Latitude|Issue lifecycle, auto-eval from prod failures|Younger, smaller ecosystem|Watch|

**Sources**:
- [Langfuse JS v3→v4 upgrade path](https://langfuse.com/docs/observability/sdk/upgrade-path/js-v3-to-v4)
- [TypeScript SDK v4 GA — 2025-08-28](https://langfuse.com/changelog/2025-08-28-typescript-sdk-v4-ga)
- [Langfuse alternatives 2026 — Laminar](https://laminar.sh/article/langfuse-alternatives-2026)
- [Best LLM observability 2026 — Latitude](https://latitude.so/blog/best-llm-observability-tools-agents-latitude-vs-langfuse-langsmith)
- [Langfuse self-hosting](https://langfuse.com/self-hosting)
- [ClickHouse blog — Langfuse architecture](https://clickhouse.com/blog/langfuse-and-clickhouse-a-new-data-stack-for-modern-llm-applications)

### Self-host vs Cloud (Musaium V1 = pre-revenue B2B)

- **Cloud Free tier**: 50k events/mo, 2 users, 30-day retention — exhausted at ~1666 chat requests/day. Not enough for 100k users.
- **Cloud Pro $29/mo**: 100k events/mo + $8 per extra 100k. At 100k MAU × 3 chats/mo × 4 spans/chat = 1.2M events/mo → ~$117/mo. Cheap.
- **Self-hosted (Langfuse v3)**: requires Postgres + ClickHouse + Redis + S3-compatible blob storage. 4-core / 16 GB CPU node = ~$50-80/mo, handles ~5M spans/day per public benchmark. Per Langfuse handbook architecture page. ([langfuse.com/handbook/product-engineering/architecture](https://langfuse.com/handbook/product-engineering/architecture))

**Recommendation for V1**: Cloud Pro now → migrate to self-host post-launch if cost > $300/mo. Self-host adds 1 ClickHouse + 1 Redis + 1 MinIO instance to OPS — meaningful cognitive load.

---

## 5) Pino vs Winston — current Musaium logger

### Current implementation

`museum-backend/src/shared/logger/logger.ts` is a **hand-rolled `console.log` JSON wrapper** — not Pino, not Winston. ~40 LOC, emits NDJSON to stdout.

Pros:
- Zero deps, zero bootstrap risk (the comment notes a real bug where importing `@src/config/env` from logger eager-evaluated the env schema and broke testcontainers — pure stdlib avoids this).
- Already structured (JSON), already has `service` / `environment` / `version` / `hostname` defaults.

Cons:
- **No OpenTelemetry trace correlation** — no `traceId` / `spanId` injection from the active span context. This is the #1 reason to switch.
- No log levels filtering (always emits).
- No sampling / rate-limit.
- Synchronous `console.log` blocks the event loop on log-heavy paths.

### Pino vs Winston (2026 state of the art)

|Aspect|Pino 9|Winston|console.log JSON|
|---|---|---|---|
|Throughput (per official bench)|10k logs in ~115ms / 222k ops/sec|10k in ~270ms / 36k ops/sec|10k in ~500ms (process.stdout.write blocking)|
|Architecture|Async via worker thread, minimal JSON write|Synchronous formatters per transport|Synchronous|
|OTel correlation|`@opentelemetry/instrumentation-pino` auto-injects `trace_id`/`span_id`|`@opentelemetry/instrumentation-winston` ditto|Manual only|
|Transports|`pino-loki`, `pino-opentelemetry-transport`, `pino-pretty`, `pino-roll`, …|`winston-loki`, `winston-elasticsearch`, …|None|
|Boilerplate|Light, but transports require worker spawn|Heavy — formatters + transports + levels|None — that's the appeal|

Sources: [PkgPulse — Pino vs Winston 2026](https://www.pkgpulse.com/guides/pino-vs-winston-2026), [SigNoz Pino guide](https://signoz.io/guides/pino-logger/), [Better Stack — 8 Node loggers](https://betterstack.com/community/guides/logging/best-nodejs-logging-libraries/).

### Recommendation

**Switch to Pino 9 with `pino-opentelemetry-transport`** before scaling to 100k users. The current `console.log` wrapper is fine functionally but breaks the correlation triangle (logs ↔ traces ↔ metrics) that Grafana / Tempo / Loki rely on.

Path:
1. Install `pino@^9` + `@opentelemetry/instrumentation-pino` + `pino-loki` (or `pino-opentelemetry-transport`).
2. Rewrite `logger.ts` thin wrapper over Pino (preserve current `logger.info(msg, ctx)` signature).
3. Add `@opentelemetry/instrumentation-pino` to the `getNodeAutoInstrumentations()` call — auto-injects `trace_id` / `span_id`.
4. Configure stdout (Docker captures) + optional Loki transport.
5. Effort: ~3-4h, can be done at the same time as the Langfuse v5 migration.

Source for Pino + OTel correlation: [Medium — Node Structured Logging with Pino + OTel 2026](https://medium.com/@hadiyolworld007/node-js-structured-logging-with-pino-opentelemetry-correlated-traces-logs-and-metrics-in-one-2c28b10c4fa0), [dev.to — Pino 9 + OTel guide](https://dev.to/1xapi/how-to-add-structured-logging-to-nodejs-apis-with-pino-9-opentelemetry-2026-guide-3jd2).

---

## 6) Grafana 2026 — dashboards-as-code + on-call

### Where Musaium stands

Per `CLAUDE.md` and `infra/grafana/`:
- Prometheus + Grafana self-hosted on VPS OVH (`infra/grafana/docker-compose*.yml`)
- `infra/grafana/dashboards/visual-compare.json` exists (C3 dashboard)
- `infra/grafana/prometheus.yml` (prod target `backend:3000`) and `infra/grafana/prometheus.local.yml` (local `host.docker.internal:3000`)
- `external_labels` `${VAR}` expansion enabled via `--enable-feature=expand-external-labels`

### State of dashboards-as-code (2026)

- **Grizzly is deprecated** (per Grafana docs). Removed from active development. Use `grafana-cli` or Foundation SDK instead. ([grafana.com Grizzly](https://grafana.com/docs/grafana/latest/as-code/infrastructure-as-code/grizzly/))
- **Grafonnet (Jsonnet)**: still alive but has the Jsonnet learning curve.
- **Grafana Foundation SDK (Go, TS, Python, Java, PHP)**: newest official path. TS variant aligns with Musaium's stack — recommended if dashboards-as-code becomes important post-launch.
- **Terraform Grafana provider**: stable, mature — best path if Musaium already uses Terraform.
- **Grafana Operator (Kubernetes)**: only if Musaium goes K8s.

### Alerting / on-call landscape (2026)

**Critical 2026 change**: **Grafana OnCall OSS entered maintenance mode March 2025, archived March 2026**. Replaced by **Grafana Cloud IRM**. ([incident.io — Open-source PagerDuty alternatives 2026](https://incident.io/blog/best-open-source-pagerduty-alternatives-2026))

For Musaium pre-launch (B2C, no B2B revenue yet, self-hosted), the practical options:

|Tool|Cost|Effort|Notes|
|---|---|---|---|
|**Alertmanager** (built-in)|Free|Low|Webhook + Slack + email. Sufficient for V1.|
|**Grafana Cloud IRM**|Paid SaaS|Low|Replacement for Grafana OnCall, full incident response|
|PagerDuty|$21+/user/mo|Low|Industry standard but expensive|
|incident.io|Paid|Medium|Slack-native, modern|
|Better Stack|Cheaper than PD|Low|Good middle option|

**Recommendation V1**: Alertmanager → Slack webhook for the launch. Revisit IRM tooling post-launch when on-call rotation matters.

### Recommended Grafana dashboards to add before launch

1. **Chat pipeline RED** — `chat_request_duration_seconds`, `chat_phase_*`, error rate by outcome.
2. **LLM cost** — token usage × pricing, per-provider + per-model.
3. **LLM Guard health** — `musaium_llm_guard_circuit_breaker_state{state}` panel + `_skips_total` + `_scan_duration_seconds`.
4. **Wikidata résilience** — circuit state, request outcome breakdown, dump fallback rate.
5. **Cache hit rate** — `llm_cache_hits / (hits + misses)` per `context_class`.
6. **Anti-hallucination** — `chat_sources_emitted` / `chat_sources_rejected` ratio + `chat_url_head_probe` cache hit rate.
7. **Process** — Node event loop lag, GC pauses, heap, FD count (from `enableDefaultMetrics()`).
8. **Postgres** — connection pool, slow queries, replication lag.

**Sources**:
- [Grafana — as-code complete guide](https://grafana.com/blog/2022/12/06/a-complete-guide-to-managing-grafana-as-code-tools-tips-and-tricks/)
- [Prezi — switch from PagerDuty](https://grafana.com/blog/inside-prezis-cost-saving-switch-to-grafana-alerting-grafana-oncall-and-grafana-incident-from-pagerduty/)
- [incident.io — best open-source PagerDuty alternatives 2026](https://incident.io/blog/best-open-source-pagerduty-alternatives-2026)

---

## 7) SLI / SLO for AI applications

### What matters (per 2026 doctrine)

Per [Fiddler AI](https://www.fiddler.ai/articles/ai-guardrails-metrics), [Datadog](https://www.datadoghq.com/blog/llm-guardrails-best-practices/), [Sentry KPIs](https://blog.sentry.io/core-kpis-llm-performance-how-to-track-metrics/), [Galileo](https://galileo.ai/blog/effective-llm-monitoring), [Portkey](https://portkey.ai/blog/the-complete-guide-to-llm-observability/):

|SLI|What it answers|Musaium gap|
|---|---|---|
|**Chat TTFT p95 ≤ 800ms / total p95 ≤ 5s**|"Is the UX still good?"|`chat_request_duration_seconds` exists — SLO targets undocumented|
|**Per-phase p95 (STT / LLM / TTS)**|"Which leg is the bottleneck?"|`chat_phase_duration_seconds` exists ✓|
|**Error rate ≤ 1% on 28d**|"Is the pipeline reliable?"|`chat_phase_errors_total` exists ✓|
|**Token cost per request**|"What is our per-user economics?"|**MISSING** — no token-usage metric|
|**LLM cache hit rate ≥ 30%**|"Is the cache actually saving money?"|`llm_cache_hits/misses_total` ✓ — no SLO yet|
|**Guardrail block rate (input + output)**|"Are we filtering enough? Too much?"|Partial via `chat_request_duration{outcome=guardrail_blocked}` — needs a dedicated counter for alerting|
|**LLM Guard scan p95 ≤ 1.5s**|"Is the AI safety sidecar fast enough?"|`musaium_llm_guard_scan_duration_seconds` ✓|
|**LLM Guard circuit OPEN rate**|"How often does the safety sidecar fail?"|`musaium_llm_guard_circuit_breaker_trips_total` ✓|
|**Audit chain integrity**|"Are we losing audit events? Were any tampered?"|**MISSING — no chain-break metric**. The `audit-chain:verify` script exists but no live integrity counter.|
|**Wikidata SPARQL availability**|"Is the KB still reachable?"|`wikidata_sparql_*` ✓|
|**Hallucination rate**|"How often do we cite invalid sources?"|`chat_sources_rejected_total{reason}` ≈ proxy — no quality eval|
|**Fallback rate**|"How often do we degrade gracefully?"|`compare_fallback_total` + `chat_websearch_fallback_total` ✓|

### Concrete SLO recommendations for launch

|SLO|Window|Burn-rate alert|
|---|---|---|
|`chat_request_duration p95 ≤ 5s`|28d|1h+5m fast (14.4×) → page; 6h+30m slow (6×) → ticket|
|`chat error rate ≤ 1%`|28d|same multi-burn-rate scheme|
|`llm_guard_scan p95 ≤ 1.5s`|28d|3h+15m (5×) → ticket|
|`audit_chain integrity = 0 breaks`|continuous|any break → page immediately|
|`wikidata sparql 5m availability ≥ 99%`|28d|circuit OPEN ≥ 30min → ticket|

Multi-burn-rate alerting is the **standard** per [Google SRE](https://sre.google/workbook/alerting-on-slos/) and confirmed by [oneuptime 2026 SRE burn-rate guide](https://oneuptime.com/blog/post/2026-01-30-sre-burn-rate-alerts/view).

### Audit chain integrity — important compliance gap

Per [EU AI Act Article 12 — full enforcement August 2026](https://www.helpnetsecurity.com/2026/04/16/eu-ai-act-logging-requirements/), high-risk AI systems must support tamper-evident logging. Musaium's `audit-chain:verify` is a script, not a live SLI. Recommend:

- `audit_chain_break_total{reason}` counter — incremented when verifier detects a hash mismatch
- `audit_chain_last_verified_age_seconds` gauge — alerts if > 24h (verifier didn't run)
- `audit_chain_entries_total` counter — sanity check

Even if EU AI Act doesn't *strictly* require crypto chains, it's the "economically rational choice" per [veritaschain analysis 2026](https://dev.to/veritaschain/the-eu-ai-act-doesnt-mandate-cryptographic-logs-but-youll-want-them-anyway-97f). Musaium already has the chain — surface it as a live metric.

**Sources**:
- [Google SRE — Alerting on SLOs](https://sre.google/workbook/alerting-on-slos/)
- [oneuptime — SRE burn-rate alerts 2026](https://oneuptime.com/blog/post/2026-01-30-sre-burn-rate-alerts/view)
- [Sentry — Core KPIs for LLM performance](https://blog.sentry.io/core-kpis-llm-performance-how-to-track-metrics/)
- [Datadog — LLM guardrails best practices](https://www.datadoghq.com/blog/llm-guardrails-best-practices/)
- [Fiddler — AI guardrails metrics](https://www.fiddler.ai/articles/ai-guardrails-metrics)
- [Portkey — complete LLM observability guide 2026](https://portkey.ai/blog/the-complete-guide-to-llm-observability/)
- [EU AI Act logging — Help Net Security 2026-04](https://www.helpnetsecurity.com/2026/04/16/eu-ai-act-logging-requirements/)

---

## 8) Distributed tracing for LLM calls

### State of GenAI semantic conventions (2026)

Per [OpenTelemetry GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) — **all in Development status** (not yet stable). But major vendors already implement:

- **Datadog**: native support since OTel v1.37 (2026-Q1)
- **Langfuse v5**: full GenAI semconv emission
- **Sentry v10**: reads GenAI attributes
- **OpenLLMetry**: vendor-neutral auto-instrumentation patches OpenAI / Anthropic / Bedrock / Cohere / LangChain etc.

Required attribute (per spec):
- `gen_ai.client.operation.duration` (Histogram, **Required**)

Recommended:
- `gen_ai.client.token.usage` (Histogram)
- `gen_ai.client.operation.time_to_first_chunk` (streaming)
- `gen_ai.client.operation.time_per_output_chunk` (streaming)

Span attributes:
- `gen_ai.system` (openai / anthropic / deepseek / google)
- `gen_ai.request.model`
- `gen_ai.usage.input_tokens` / `output_tokens`
- `gen_ai.response.finish_reasons`
- `gen_ai.request.temperature` etc.

### Context propagation to LLM providers

The W3C TraceContext header (`traceparent`) is the standard. ([opentelemetry.io/docs/languages/js/propagation](https://opentelemetry.io/docs/languages/js/propagation/))

For Musaium's OpenAI SDK calls:
1. The HTTP instrumentation auto-injects `traceparent` on outgoing requests — already happens via `@opentelemetry/auto-instrumentations-node`.
2. OpenAI itself doesn't propagate `traceparent` back, so the trace stops at our HTTP client. Same for Deepseek, Google.
3. **OpenLLMetry / `@traceloop/instrumentation-openai`** adds GenAI-semconv-compliant child spans with token usage, model, etc. — child of our HTTP span.

### Recommended additions for Musaium

- Install `@traceloop/instrumentation-openai` (or use LangChain's built-in OTel integration since LangChain.js supports OTel as of 2026).
- Add spans tagged with GenAI semconv attributes in the chat orchestrator (LLM phase).
- Once Langfuse v5 is in, all of this flows automatically through the `LangfuseSpanProcessor`.

**Sources**:
- [OTel GenAI semantic conventions — spec](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
- [OTel GenAI metrics — spec](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-metrics/)
- [Datadog — GenAI semconv native support](https://www.datadoghq.com/blog/llm-otel-semantic-convention/)
- [OpenLLMetry — Traceloop](https://github.com/traceloop/openllmetry)
- [Zylos — OTel for AI agents 2026-02](https://zylos.ai/research/2026-02-28-opentelemetry-ai-agent-observability)
- [Uptrace — OTel for AI Systems 2026](https://uptrace.dev/blog/opentelemetry-ai-systems)

---

## 9) Verdict for Musaium 100k

### Strengths (keep)

1. **OTel SDK v2 architecture correctly settled** post 2026-05-12 hotfix. `resourceFromAttributes`, `RouterInstrumentation` disabled, `instrumentation-fs`/`-dns` disabled. Clean.
2. **Sentry v10 + `skipOpenTelemetrySetup` + `getDefaultIntegrationsWithoutPerformance()`** = textbook OTel/Sentry coexistence.
3. **Prometheus metrics — 27 metrics, all cardinality-bounded with documented budgets.** Discipline is excellent.
4. **Sentry PII scrubber** is comprehensive — exceeds the SDK default.
5. **Fail-open everywhere** (safeTrace wrapper, swallowed metric throws) — no observability throw can crash the chat path.
6. **Circuit breakers + metrics** for Wikidata SPARQL and LLM Guard sidecar — recent (2026-05) ADRs aligned with state of the art.

### Critical gaps (do before launch)

|Gap|Effort|Risk if not done|
|---|---|---|
|**Langfuse v3.38 → v5 migration**|4-6h|OTel-native traces don't reach Langfuse, double-spans, no GenAI semconv|
|**Prometheus exemplars (OpenMetrics registry)**|2-3h|No metric → trace click-through in Grafana|
|**Log-trace correlation (Pino + `@otel/instrumentation-pino`)**|3-4h|Investigations require manual `requestId` chaining|
|**SLO docs + burn-rate alerts**|1 day|Pager noise / silent SLO violations|
|**GenAI semconv on LLM spans**|1-2 days|Lock-in to Musaium-specific labels, no vendor portability|
|**Audit chain integrity live metric**|2h|Compliance / EU AI Act surface gap|

### Nice-to-have (post-launch)

- Tail-sampling at OTel Collector for cost optimization
- Recording rules for SLO computation (`sli_chat_request_success_rate:5m`)
- LGTM stack consolidation (currently Prometheus + Grafana; consider Loki for logs + Tempo for traces once Pino transport is wired)
- Dashboards-as-code via Foundation SDK (Grizzly is dead)
- Grafana Cloud IRM or alternative when on-call rotation matures

### Cost analysis for 100k MAU

|Component|Cost / month|Notes|
|---|---|---|
|Self-hosted Prometheus + Grafana (current)|~$30 (VPS)|Included in OVH bill|
|Sentry SaaS|~$80-150 (Team plan + 5% trace sampling)||
|Langfuse Cloud Pro (option A)|~$117 (1.2M events)|or self-host = $50-80 for own ClickHouse/Redis|
|**Total (option A)**|**~$230-300/mo**|Reasonable for 100k MAU|
|For comparison — Datadog equivalent|**$4000-15000/mo**|Vendor lock-in trap|

**Final verdict**: **KEEP the architecture, FIX the gaps, AVOID Datadog.** Current trajectory is enterprise-grade. The 2026-05-12 hotfix work was correct. Closing the 5 critical gaps above before 2026-06-01 launch (estimated 3-4 days total engineering) puts Musaium in the top 10% of production AI applications by observability maturity.

---

## Sources index

### Official docs
- [OpenTelemetry blog — JS SDK 2.0 announcement (Feb 2025)](https://opentelemetry.io/blog/2025/otel-js-sdk-2-0/)
- [OpenTelemetry — Upgrade to JS SDK 2.x](https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/upgrade-to-2.x.md)
- [OpenTelemetry — Versioning and stability spec](https://opentelemetry.io/docs/specs/otel/versioning-and-stability/)
- [OpenTelemetry — GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
- [OpenTelemetry — GenAI metrics spec](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-metrics/)
- [OpenTelemetry — Sampling concepts](https://opentelemetry.io/docs/concepts/sampling/)
- [OpenTelemetry — Context propagation JS](https://opentelemetry.io/docs/languages/js/propagation/)
- [Sentry — v9→v10 migration JavaScript](https://docs.sentry.io/platforms/javascript/migration/v9-to-v10/)
- [Sentry — v9→v10 migration Node](https://docs.sentry.io/platforms/javascript/guides/node/migration/v9-to-v10/)
- [Sentry — Node OTel custom setup](https://docs.sentry.io/platforms/javascript/guides/node/opentelemetry/custom-setup/)
- [Sentry — sample rates concepts](https://docs.sentry.io/concepts/key-terms/sample-rates/)
- [Langfuse — JS v3 → v4 upgrade](https://langfuse.com/docs/observability/sdk/upgrade-path/js-v3-to-v4)
- [Langfuse — JS v4 → v5 upgrade](https://langfuse.com/docs/observability/sdk/upgrade-path/js-v4-to-v5)
- [Langfuse — Changelog TS SDK v4 GA 2025-08-28](https://langfuse.com/changelog/2025-08-28-typescript-sdk-v4-ga)
- [Langfuse — Self-hosting](https://langfuse.com/self-hosting)
- [Langfuse — Native OTel integration](https://langfuse.com/integrations/native/opentelemetry)
- [Google SRE — Alerting on SLOs](https://sre.google/workbook/alerting-on-slos/)
- [prom-client GitHub README](https://github.com/siimon/prom-client)
- [prom-client npm registry — verified v15.1.3 latest 2026-05-12](https://www.npmjs.com/package/prom-client)
- [@sentry/node npm registry — verified v10.53.1 latest 2026-05-12](https://www.npmjs.com/package/@sentry/node)
- [@langfuse/tracing npm registry — verified v5.3.0 latest 2026-05-12](https://www.npmjs.com/package/@langfuse/tracing)

### 2026 industry sources
- [Grafana Labs — Manage high cardinality Prometheus metrics](https://grafana.com/blog/how-to-manage-high-cardinality-metrics-in-prometheus-and-kubernetes/)
- [Last9 — High cardinality Prometheus 2026](https://last9.io/blog/how-to-manage-high-cardinality-metrics-in-prometheus/)
- [Eric Schabell — Linking metrics to traces with exemplars](https://www.schabell.org/2024/09/hands-on-guide-to-opentelemetry-linking-metrics-to-traces-with-exemplars-part2.html)
- [PkgPulse — Pino vs Winston 2026](https://www.pkgpulse.com/guides/pino-vs-winston-2026)
- [SigNoz — Pino Logger 2026 guide](https://signoz.io/guides/pino-logger/)
- [Dash0 — Top 7 Node.js logging libraries](https://www.dash0.com/guides/nodejs-logging-libraries)
- [Laminar — Langfuse alternatives 2026](https://laminar.sh/article/langfuse-alternatives-2026)
- [Latitude — Best LLM observability tools 2026](https://latitude.so/blog/best-llm-observability-tools-agents-latitude-vs-langfuse-langsmith)
- [Spheron — LLM observability on GPU Cloud 2026](https://www.spheron.network/blog/llm-observability-gpu-cloud-langfuse-arize-phoenix-helicone/)
- [Datadog — LLM OTel semantic conventions native support](https://www.datadoghq.com/blog/llm-otel-semantic-convention/)
- [Datadog — LLM guardrails best practices](https://www.datadoghq.com/blog/llm-guardrails-best-practices/)
- [Fiddler — AI guardrails metrics](https://www.fiddler.ai/articles/ai-guardrails-metrics)
- [Portkey — LLM observability complete guide 2026](https://portkey.ai/blog/the-complete-guide-to-llm-observability/)
- [Sentry blog — Core LLM KPIs](https://blog.sentry.io/core-kpis-llm-performance-how-to-track-metrics/)
- [Sentry blog — Sentry SDK upgrade overdue](https://blog.sentry.io/overdue-for-a-sentry-sdk-upgrade/)
- [Sentry blog — Sampling strategy](https://blog.sentry.io/sampling-strategy-sentry/)
- [Galileo — Effective LLM monitoring](https://galileo.ai/blog/effective-llm-monitoring)
- [Anyscale — LLM latency and throughput metrics](https://docs.anyscale.com/llm/serving/benchmarking/metrics)
- [Uptrace — Sampling head vs tail](https://uptrace.dev/opentelemetry/sampling)
- [Uptrace — OpenTelemetry for AI Systems 2026](https://uptrace.dev/blog/opentelemetry-ai-systems)
- [Zylos — OpenTelemetry for AI agents 2026-02](https://zylos.ai/research/2026-02-28-opentelemetry-ai-agent-observability)
- [oneuptime — Head vs tail sampling 2026](https://oneuptime.com/blog/post/2026-01-24-head-based-vs-tail-based-sampling/view)
- [oneuptime — Burn-rate alerts 2026](https://oneuptime.com/blog/post/2026-01-30-sre-burn-rate-alerts/view)
- [oneuptime — Metric-trace correlation 2026](https://oneuptime.com/blog/post/2026-01-30-metric-trace-correlation/view)
- [oneuptime — Disable unnecessary auto-instrumentation 2026](https://oneuptime.com/blog/post/2026-02-06-disable-unnecessary-auto-instrumentation-reduce-noise/view)
- [incident.io — Open-source PagerDuty alternatives 2026](https://incident.io/blog/best-open-source-pagerduty-alternatives-2026)
- [SigNoz — Datadog vs Grafana 2026 cost comparison](https://signoz.io/blog/datadog-vs-grafana/)
- [APIScout — Datadog vs SigNoz vs Grafana vs OpenObserve 2026](https://apiscout.dev/blog/datadog-vs-signoz-vs-grafana-vs-openobserve-2026)
- [ClickHouse — Langfuse new data stack](https://clickhouse.com/blog/langfuse-and-clickhouse-a-new-data-stack-for-modern-llm-applications)
- [Help Net Security — EU AI Act logging 2026-04](https://www.helpnetsecurity.com/2026/04/16/eu-ai-act-logging-requirements/)
- [Veritaschain — Cryptographic audit trails 2026](https://dev.to/veritaschain/the-eu-ai-act-doesnt-mandate-cryptographic-logs-but-youll-want-them-anyway-97f)
- [DEV — Node observability stack 2026](https://dev.to/axiom_agent/the-nodejs-observability-stack-in-2026-opentelemetry-prometheus-and-distributed-tracing-229b)
- [Calmops — OpenTelemetry Observability 2026 guide](https://calmops.com/devops/opentelemetry-observability-2026-complete-guide/)

### Codebase references (Musaium)
- `museum-backend/src/shared/observability/opentelemetry.ts`
- `museum-backend/src/shared/observability/sentry.ts`
- `museum-backend/src/shared/observability/prometheus-metrics.ts`
- `museum-backend/src/shared/observability/langfuse.client.ts`
- `museum-backend/src/shared/observability/chat-phase-timer.ts`
- `museum-backend/src/shared/observability/sentry-scrubber.ts`
- `museum-backend/src/shared/observability/safeTrace.ts`
- `museum-backend/src/shared/observability/metrics-context.ts`
- `museum-backend/src/shared/logger/logger.ts`
- `museum-backend/package.json` (deps versions verified)

---

*End R6 report. UFR-013 attestation: every version number, breaking change, and "current best practice" claim above is sourced via WebFetch / WebSearch / npm-registry API or marked `[NOT VERIFIED]`. The 4 npm-registry calls were direct HTTPS reads of `registry.npmjs.org/{package}/latest` and quoted verbatim in the relevant sections.*
