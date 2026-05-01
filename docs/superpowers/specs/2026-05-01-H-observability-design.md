# H — Observability + Load Test + Chaos

**Date:** 2026-05-01
**Subsystem:** H of A→H scale-hardening decomposition
**Status:** Approved (autonomous mode — design + script delivery; live deployment is ops responsibility)
**Predecessors:** A1+A2, C, D, E, F (cluster code knobs), G (cache hit/miss events)

---

## 1. Context

Scale hardening A through G is shipped. Observability is the verification
layer: without metrics dashboards + load tests + chaos experiments, the
new infrastructure (replicas, cluster, cache) can't be proven to actually
absorb the target load.

Existing infra:
- OpenTelemetry wired (`src/shared/observability/opentelemetry.ts`).
- Sentry wired (`src/shared/observability/sentry.ts`).
- k6 scripts exist for auth, chat, concurrent-users, stress-200vu
  (`tests/perf/k6/`).

Missing:
- Prometheus `/metrics` endpoint with RED metrics (Rate, Errors, Duration)
  per route + business metrics (cache hit ratio, LLM cost per request).
- Grafana dashboard JSON template.
- k6 stress script targeting 100K rps (current top is 200vu).
- Chaos runbook scripts for the F components (Redis cluster / PG replica /
  LLM provider failure simulation).
- ADR documenting the SLO targets + error budget policy.

## 2. Goals

1. **ADR-XXX SLO + Observability strategy**: defines the SLOs, error
   budget, alerting tiers.
2. **Prometheus metrics endpoint** at `/metrics` (Express middleware
   + `prom-client` library). Exposes:
   - `http_requests_total{route, status, method}` (counter)
   - `http_request_duration_seconds{route, method}` (histogram)
   - `llm_cache_hits_total{context_class}` (counter)
   - `llm_cache_misses_total{context_class}` (counter)
   - `db_query_duration_seconds{query_type}` (histogram, optional)
3. **Grafana dashboard JSON** committed to repo — operator imports.
4. **k6 100K rps stress script** — `tests/perf/k6/stress-100k-rps.k6.js`.
   Includes documented sizing assumptions; NOT auto-run in CI.
5. **Chaos runbooks** — `docs/CHAOS_RUNBOOKS.md` describing the kill
   experiments + recovery checklists.
6. **SLO doc** — `docs/SLO.md` lists numeric targets with rationale.

Non-goals:
- Actually running k6 against prod (operator's call when infra is
  provisioned).
- Auto-running chaos in CI (out of scope; chaos engineering is a
  controlled deliberate exercise).
- Setting up the Grafana instance itself (Cloudflare/Grafana Cloud
  account is operator territory).

---

## 3. SLO targets (committed in `docs/SLO.md`)

| SLO | Target | Notes |
|---|---|---|
| API availability | 99.9% monthly | 43 minutes error budget per month |
| API p99 latency (chat POST) | < 5 s | LLM inference dominates; tighter with cache hit |
| API p99 latency (other) | < 200 ms | Read paths via replica + Redis |
| LLM cache hit ratio | > 30% steady state | Higher = lower cost; subsystem G measures |
| Redis cache hit ratio | > 80% on chat session bag | F2 cluster expansion target |
| BullMQ job lag | < 60 s p99 | Knowledge extraction + retention prune crons |
| Audit log integrity | 100% | Hash chain — broken chain pages immediately |

## 4. Files

```
docs/adr/
└── ADR-XXX-slo-observability-strategy.md           NEW

docs/
├── SLO.md                                           NEW
├── CHAOS_RUNBOOKS.md                                NEW
└── observability/
    └── musaium-backend-dashboard.json               NEW — Grafana JSON

museum-backend/src/
├── shared/observability/
│   └── prometheus-metrics.ts                        NEW — prom-client setup
└── helpers/
    └── metrics-middleware.ts                        NEW — Express middleware

museum-backend/src/app.ts                            MODIFY — wire /metrics
museum-backend/src/modules/chat/useCase/
└── llm-cache.service.ts                             MODIFY — emit cache_hit/miss to metrics

museum-backend/tests/perf/k6/
├── stress-100k-rps.k6.js                            NEW — 100K rps target script
└── helpers/
    └── 100k-runbook.md                              NEW — pre-flight + during-run runbook

museum-backend/tests/unit/
├── shared/observability/prometheus-metrics.test.ts  NEW
└── helpers/metrics-middleware.test.ts               NEW
```

---

## 5. Acceptance criteria

- ADR + SLO.md + CHAOS_RUNBOOKS.md committed.
- `prom-client` added as a backend dependency.
- `/metrics` endpoint returns Prometheus-format text with at least the
  4 metric families listed in goals.
- LlmCacheService emits cache hit/miss counter events (test asserts).
- Grafana dashboard JSON syntactically valid (loads in Grafana 11+).
- k6 stress script parses (`k6 inspect stress-100k-rps.k6.js` clean) — NOT
  required to actually run.
- Chaos runbook covers: Redis kill, PG replica kill, LLM provider kill.
- `pnpm exec tsc --noEmit` clean. Lint clean. Drift clean.

## 6. Out of scope

- Actual k6 100K rps execution (deferred until F infra is provisioned).
- Live Grafana instance setup.
- Multi-region observability federation.
- Distributed tracing across services (OpenTelemetry already wired
  per-process; cross-service spans require receiver setup outside this
  spec's scope).
