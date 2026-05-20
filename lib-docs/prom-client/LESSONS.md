# Lessons — prom-client (v15.1.3)

Audit 2026-05-18 : **MOSTLY_COMPLIANT_WITH_2_HIGH_FINDINGS**.

## 🚨 F1 HIGH : `req.path` fallback → UNBOUNDED CARDINALITY → Prometheus storage explosion
- **Cause** : `metrics-middleware.ts:23 const route = routePath ?? req.path`. Fallback to raw req.path when req.route undefined (404s, unmatched paths, middleware-rejected).
- **Impact** : Attacker probing `/api/foo/<random>` inflates `http_requests_total{route='/api/foo/<random>',status='404',method='GET'}` UNBOUNDEDLY. Prometheus storage explosion (DoS via cardinality bomb).
- **Fix TD-PC-01** : Replace fallback par literal `'unmatched'` ou `'unknown'` constant. Only emit metric when routePath is defined (parameterised Express route template).

## 🚨 F2 HIGH : `/metrics` PUBLICLY REACHABLE (no auth, no IP allowlist)
- **Cause** : `app.ts:222 app.get('/metrics', metricsHandler)` — no auth middleware. docker-compose.dev.yml:16 publishes `3000:3000` dev only. Prod nginx site.conf status unknown (only grafana.conf protects /grafana/).
- **Impact** : leaks internal cardinality + circuit breaker state + tenant_id + error counts + custom labels (Wikidata SPARQL latency profile, LLM cost breaker state, ...).
- **Fix TD-PC-02** : Add nginx `location = /metrics { allow <prom-ip>; deny all; }` in prod site.conf OR mount behind `requireSuperAdmin` middleware OR bind metrics on separate internal port (split server).

## ⚠️ F3 MEDIUM : Naming inconsistency (musaium_ on some, not others)
- Some metrics carry `musaium_` prefix (llmGuard*, llmCostCircuitBreaker*, tenantRateLimit*, guardrail*) but older ones don't (http_requests_total, chat_phase_duration_seconds, wikidata_*, compare_*, chat_sources_*, artwork_embeddings_count). `enableDefaultMetrics` also lacks `prefix: 'musaium_'`.
- **Fix TD-PC-03** : Decide either drop the prefix entirely (current de-facto majority) OR apply consistently + `collectDefaultMetrics({ prefix: 'musaium_' })`.

## ✅ Positives (8 PASS)
- Singleton Registry (NOT global registry pollution)
- await registry.metrics() (lazy serialization)
- Labels object form (NOT positional)
- labelNames declared at construction `as const` (TS narrowed)
- Async `collect()` fail-open (keep prev value on DB blip)
- ZERO high-cardinality user_id/session_id labels (tenant_id bounded ≤20 Phase 2)
- `enableDefaultMetrics` idempotent via flag
- 13 Histograms, 0 Summaries (aggregation-friendly)

## Stats
- 27 metrics declared : 16 counters + 4 gauges + 7 histograms
- 1 high-cardinality vulnerability (F1)
- 0 auth on /metrics (F2)

---

## Refresh 2026-05-20 — status check

- **F1 (HIGH)** : FIXED in `metrics-middleware.ts:23-26` — TD-PC-01 applied (`req.path` fallback replaced with literal `'unmatched'`). Confirmed at read time on 2026-05-20.
- **F2 (HIGH, OPEN)** : `app.ts:222 app.get('/metrics', metricsHandler)` — still no auth middleware on the route. nginx allowlist status in prod site.conf NOT verified in this refresh. **TD-PC-02 remains open, gating action item for V1 launch (2026-06-01)**.
- **F3 (MEDIUM, OPEN)** : `musaium_` prefix inconsistency persists (15 prefixed, 12 unprefixed in `prometheus-metrics.ts`). No commit landed since 2026-05-18. TD-PC-03 not yet scheduled.
- **TD-31 (planned post-V1)** : migration to `@opentelemetry/exporter-prometheus`. Concept map + gradual strategy added to `PATTERNS.md` §6a. Risk: cardinality discipline loses construction-time `labelNames` gate — must be re-enforced per call site. NOT on V1 critical path.
- **TD-43 (`geo_detect_museum_total{outcome="miss"}` ambiguity)** : confirmed at `prometheus-metrics.ts:396-401`. The Counter does not distinguish "no match" (legitimate empty result) from "throw" (Nominatim error → caller chose to record `miss`). Recommended fix: split outcome into `{hit-geofence, hit-haversine, miss-nomatch, miss-error}`. Cardinality impact: 3 → 4 series, well under 200 budget. TD-43 ready for scheduling.

## New finding F4 (LOW, 2026-05-20) — `prom-client@15.1.3` is 23 months old

Latest published release is still v15.1.3 (2024-06-27). The `Unreleased` CHANGELOG section accumulates planned v16 work but nothing has shipped in ~2 years. Not a defect — `prom-client` is a stable, low-surface library — but worth tracking against the TD-31 OTel migration timeline. If v16 ships (drops Node 16/18/21/23 + renames `AggregatorRegistry → ClusterRegistry`), the engines bump is the only blocker since Musaium has 0 `AggregatorRegistry` usages.

## New finding F5 (INFO, 2026-05-20) — no CVE in NVD / GitHub Advisory DB

Searched May 2026. No prom-client CVEs published. Supply-chain remains the only realistic vector (lockfile + Dependabot in place).
