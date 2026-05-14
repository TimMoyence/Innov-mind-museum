import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

import { logger } from '@shared/logger/logger';
import { getDataSourceForMetrics } from '@shared/observability/metrics-context';

/**
 * Prometheus metrics registry. Holds the RED metrics + business metrics
 * surfaced via the /metrics endpoint.
 *
 * Spec: see git log (deleted 2026-05-03 — roadmap consolidation, original spec in commit history)
 */
export const registry = new Registry();

let defaultMetricsRegistered = false;

/**
 * Enables default Node.js process metrics (CPU, memory, event-loop lag, file
 * descriptors). Idempotent. Call ONCE from app bootstrap (`src/index.ts`).
 *
 * Was previously called at module load — but `prom-client` registers
 * setInterval-based collectors that don't `.unref()`, which kept Node alive
 * past test/Stryker mutant runs and broke Stryker's hot-reload throughput
 * (forced spawn-per-mutant fallback, ~10x slowdown).
 *
 * Tests that need default metrics in the output must call this explicitly.
 */
export function enableDefaultMetrics(): void {
  if (defaultMetricsRegistered) return;
  collectDefaultMetrics({ register: registry });
  defaultMetricsRegistered = true;
}

/** RED — Rate. Total HTTP requests by route + status + method. */
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests served',
  labelNames: ['route', 'status', 'method'] as const,
  registers: [registry],
});

/** RED — Duration. HTTP request latency histogram. */
export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['route', 'method'] as const,
  buckets: [0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

/** Subsystem G — LLM cache hit counter, partitioned by context class. */
export const llmCacheHitsTotal = new Counter({
  name: 'llm_cache_hits_total',
  help: 'Total LLM response cache hits',
  labelNames: ['context_class'] as const,
  registers: [registry],
});

/** Subsystem G — LLM cache miss counter. */
export const llmCacheMissesTotal = new Counter({
  name: 'llm_cache_misses_total',
  help: 'Total LLM response cache misses',
  labelNames: ['context_class'] as const,
  registers: [registry],
});

/**
 * C1 — Per-phase chat pipeline duration. Phase ∈ {stt, llm, tts}.
 * Buckets tuned for the STT/LLM/TTS spread observed pre-baseline (cf.
 * `team-state/2026-05-08-c1-chat-fast/design.md` §10 + Q6). Cardinality is
 * strictly bounded to `phase` × `provider` to keep the active series
 * count below the 200-budget set in the spec NFR table.
 */
export const chatPhaseDurationSeconds = new Histogram({
  name: 'chat_phase_duration_seconds',
  help: 'Chat pipeline phase latency in seconds (stt, llm, tts)',
  labelNames: ['phase', 'provider'] as const,
  buckets: [0.1, 0.25, 0.5, 1, 1.5, 2, 3, 5, 8, 12],
  registers: [registry],
});

/**
 * C1 — End-to-end chat request duration. `outcome` ∈ {success, error,
 * guardrail_blocked, circuit_open, cache_hit}. Uses default histogram
 * buckets (broader spread than per-phase since e2e accumulates phases).
 */
export const chatRequestDurationSeconds = new Histogram({
  name: 'chat_request_duration_seconds',
  help: 'Chat request end-to-end latency in seconds, by outcome',
  labelNames: ['outcome'] as const,
  registers: [registry],
});

/**
 * C1 — Per-phase chat pipeline error counter. Cardinality bounded to
 * `phase` × `provider` × `error_type`. `error_type` is a stable taxonomy
 * (timeout, upstream_5xx, abort, unknown) — not a raw error message.
 */
export const chatPhaseErrorsTotal = new Counter({
  name: 'chat_phase_errors_total',
  help: 'Total chat pipeline phase errors, by phase/provider/error_type',
  labelNames: ['phase', 'provider', 'error_type'] as const,
  registers: [registry],
});

/**
 * C2 v2 (2026-05) — per-source image enrichment call counter. Cardinality is
 * bounded:
 *   - `source` ∈ {wikidata, unsplash, commons, musaium}
 *   - `outcome` ∈ {success, error, timeout, disabled}
 * Total active series ≤ 16. Increment in `ImageEnrichmentService.fetchSourcePhotos`.
 */
export const chatEnrichmentSourceCallsTotal = new Counter({
  name: 'chat_enrichment_source_calls_total',
  help: 'Total image-enrichment source-client calls, by source and outcome',
  labelNames: ['source', 'outcome'] as const,
  registers: [registry],
});

/**
 * C2 v2 (2026-05) — per-source image enrichment latency histogram.
 * Same `source` dimension as the calls counter; outcomes collapsed in p50/p95.
 */
export const chatEnrichmentSourceLatencySeconds = new Histogram({
  name: 'chat_enrichment_source_latency_seconds',
  help: 'Image-enrichment source-client latency in seconds, by source',
  labelNames: ['source'] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 3, 5, 8],
  registers: [registry],
});

/**
 * C3 visual similarity (2026-05 / Phase 9 T9.x corrective) — Prometheus
 * surface mandated by `spec.md §10 NFR`. Cardinality is bounded so the
 * series count stays explainable:
 *   - `requests_total` has no labels (just total throughput).
 *   - `duration_seconds` carries one `stage` label ∈ {total, encode, search,
 *     enrich, fusion}. 5 active series.
 *   - `fallback_total` carries one `reason` label ∈ {encoder_unavailable,
 *     no_visual_neighbor}. 2 active series.
 *   - `cache_hits_total` has no labels — a single counter, paired with
 *     `requests_total` for the hit-rate computation in the dashboard.
 *
 * Total compare-namespaced active series ≤ 9. The Grafana dashboard
 * (`infra/grafana/dashboards/visual-compare.json`) consumes the per-stage
 * histogram for the latency panels and the fallback counter for the
 * encoder-unavailability rate.
 */
export const compareRequestsTotal = new Counter({
  name: 'compare_requests_total',
  help: 'Total /chat/compare requests reaching the use-case (post-auth, post-rate-limit)',
  registers: [registry],
});

/**
 * Per-stage latency histogram. Bucket boundaries pinned to the spec NFR
 * latency budget (p95 ≤ 3s for `total`); finer buckets at the low end so
 * fast cache hits / single-stage spikes resolve in the panel.
 */
export const compareDurationSeconds = new Histogram({
  name: 'compare_duration_seconds',
  help: 'Per-stage latency of the /chat/compare pipeline',
  labelNames: ['stage'] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 1.5, 2, 3, 5, 8],
  registers: [registry],
});

/**
 * Counter of fallback responses by reason. Increments on the contractual
 * fallback paths in the orchestrator (encoder unavailable, no neighbour).
 * 4xx client errors are tracked via `http_requests_total` instead.
 */
export const compareFallbackTotal = new Counter({
  name: 'compare_fallback_total',
  help: 'Total /chat/compare requests that returned a contractual fallback envelope',
  labelNames: ['reason'] as const,
  registers: [registry],
});

/**
 * Top-K result-cache hit counter. Pair with `compare_requests_total` to
 * compute the cache hit rate in the dashboard.
 */
export const compareCacheHitsTotal = new Counter({
  name: 'compare_cache_hits_total',
  help: 'Total /chat/compare requests served from the top-K result cache (no encoder/repo hit)',
  registers: [registry],
});

/**
 * C3 visual similarity (T9.2) — catalogue size gauge. Updated SYNCHRONOUSLY
 * on every `/metrics` scrape via the `collect()` callback (no scheduler);
 * Prometheus scrape interval (~15-30s) is the effective sampling cadence.
 *
 * Fail-open: if the DataSource hasn't been wired yet (early boot, tests) or
 * the `SELECT count(*)` rejects (DB outage, transient connectivity), the
 * gauge keeps its previous value rather than being reset to 0 — this avoids
 * spurious "catalog drift" Sentry alerts (T9.5) on a momentary DB blip.
 *
 * The `SELECT count(*)` is exact, not the `pg_class.reltuples` estimate.
 * Trade-off accepted: at the V1 scale (~10k rows, indexed) the count is
 * ≪10ms; if the catalogue ever grows past ~100k we can swap to the
 * estimate without changing the metric contract.
 */
export const artworkEmbeddingsCount = new Gauge({
  name: 'artwork_embeddings_count',
  help: 'Total rows in artwork_embeddings (C3 catalogue size). Refreshed on every /metrics scrape.',
  registers: [registry],
  async collect() {
    const ds = getDataSourceForMetrics();
    if (!ds) return;
    try {
      const rows = await ds.query<{ count: string }[]>(
        'SELECT count(*)::text AS count FROM artwork_embeddings',
      );
      this.set(Number(rows[0]?.count ?? 0));
    } catch (err) {
      logger.warn('artwork_embeddings_count_collect_failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
});

/**
 * C5 (2026-05) — Wikidata résilience surface mandated by ADR-039 and the C5
 * launch prompt §J Phase 6.2-4. The breaker emits state + outcome + duration ;
 * the KnowledgeBaseService emits cache + dump hit/miss counters. Cardinality
 * is strictly bounded so the active series count stays explainable :
 *
 *   - `wikidata_sparql_circuit_state` carries one `state` label ∈ {closed, open,
 *     half_open}. 3 active series. Gauge holds 1 for the current state and
 *     0 for the others, set on opossum `open` / `close` / `halfOpen` events.
 *   - `wikidata_sparql_requests_total` carries one `outcome` label ∈ {success,
 *     error, timeout, circuit_open, rate_limit}. 5 active series. NO
 *     search-term and NO QID labels — both are unbounded user-derived strings.
 *   - `wikidata_sparql_request_duration_seconds` is labelless ; buckets pinned
 *     to ADR-039 budget (timeout=5s, 60s upper bound covers worst-case retry
 *     storms). Reject events do NOT observe — the action never ran.
 *   - `wikidata_cache_hits_total` / `wikidata_cache_misses_total` are labelless
 *     (single-tier KB cache today — SWR 3-tier shape is C5.4 future work).
 *   - `wikidata_local_dump_hits_total` / `wikidata_local_dump_misses_total` are
 *     labelless ; incremented only when the cascade is *triggered* (breaker
 *     OPEN past `localDumpFallbackAfterMs` soak window).
 */
export const wikidataSparqlCircuitState = new Gauge({
  name: 'wikidata_sparql_circuit_state',
  help: 'Current state of the Wikidata SPARQL circuit breaker. 1 = active state, 0 = inactive.',
  labelNames: ['state'] as const,
  registers: [registry],
});

export const wikidataSparqlRequestsTotal = new Counter({
  name: 'wikidata_sparql_requests_total',
  help: 'Total Wikidata SPARQL requests by terminal outcome (success, error, timeout, circuit_open, rate_limit)',
  labelNames: ['outcome'] as const,
  registers: [registry],
});

export const wikidataSparqlRequestDurationSeconds = new Histogram({
  name: 'wikidata_sparql_request_duration_seconds',
  help: 'Wikidata SPARQL request latency in seconds (action calls only ; circuit_open rejects do not observe)',
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [registry],
});

export const wikidataCacheHitsTotal = new Counter({
  name: 'wikidata_cache_hits_total',
  help: 'Total Wikidata KB cache hits (Redis-backed, single-tier in V1)',
  registers: [registry],
});

export const wikidataCacheMissesTotal = new Counter({
  name: 'wikidata_cache_misses_total',
  help: 'Total Wikidata KB cache misses (falls through to provider lookup)',
  registers: [registry],
});

export const wikidataLocalDumpHitsTotal = new Counter({
  name: 'wikidata_local_dump_hits_total',
  help: 'Total Wikidata local-dump fallback hits (cascade triggered + dump returned facts)',
  registers: [registry],
});

export const wikidataLocalDumpMissesTotal = new Counter({
  name: 'wikidata_local_dump_misses_total',
  help: 'Total Wikidata local-dump fallback misses (cascade triggered + dump returned null)',
  registers: [registry],
});

/**
 * LLM Guard sidecar circuit breaker surface (2026-05-12 incident response —
 * `team-state/2026-05-12-llm-guard-circuit-breaker/`).
 *
 * Cardinality is strictly bounded :
 *   - `musaium_llm_guard_circuit_breaker_state{state}` : Gauge holding 1 for
 *     the active state and 0 for the other two. `state` ∈ {closed, half_open,
 *     open}. 3 active series.
 *   - `musaium_llm_guard_circuit_breaker_trips_total` : labelless Counter,
 *     incremented each time the breaker transitions to OPEN (from either
 *     CLOSED or HALF_OPEN). 1 active series.
 *
 * Total active series ≤ 4 — comfortably within budget.
 *
 * Call sites : the Gauge is `set()` from the breaker's `onStateChange`
 * callback wired in `chat-module.ts`. The Counter is `inc()`'d in the same
 * callback when the next state is OPEN. The breaker primitive itself stays
 * Prometheus-free (separation of concerns).
 */
export const llmGuardCircuitBreakerState = new Gauge({
  name: 'musaium_llm_guard_circuit_breaker_state',
  help: 'Current state of the LLM Guard sidecar circuit breaker. 1 = active state, 0 = inactive.',
  labelNames: ['state'] as const,
  registers: [registry],
});

export const llmGuardCircuitBreakerTripsTotal = new Counter({
  name: 'musaium_llm_guard_circuit_breaker_trips_total',
  help: 'Total transitions of the LLM Guard circuit breaker into OPEN (from CLOSED or HALF_OPEN)',
  registers: [registry],
});

/**
 * Volume of /scan calls short-circuited before reaching the sidecar (ADR-047
 * resilience surface, 2026-05-12). Two reasons coexist :
 *   - `breaker` : the breaker FSM forbids the attempt (CLOSED→OPEN cooldown
 *     or HALF_OPEN-no-slot)
 *   - `overflow` : the inflight semaphore queue is full ; fast-fail-CLOSED
 *     to keep the sidecar from drowning
 * Both end with `{allow:false, reason:'error'}` returned to the caller —
 * fail-CLOSED preserved (R1). Cardinality : 2 paths × 2 reasons = 4 series.
 */
export const llmGuardCircuitBreakerSkipsTotal = new Counter({
  name: 'musaium_llm_guard_circuit_breaker_skips_total',
  help: 'Total /scan calls short-circuited before reaching the sidecar. reason in {breaker, overflow}.',
  labelNames: ['path', 'reason'] as const,
  registers: [registry],
});

/**
 * Latency of /scan HTTP calls. Leading indicator (alerts can page on p95
 * before the breaker even trips). Outcomes :
 *   - `success` : sidecar returned 2xx + valid JSON
 *   - `fail_closed` : sidecar returned non-OK or malformed payload
 *   - `timeout` : AbortController fired before the response
 *   - `breaker_skip` : breaker FSM forbade the attempt (observed at 0s)
 *   - `overflow` : semaphore queue full (observed at 0s)
 * Buckets bracket the typical 50ms→3s window of LLM Guard inference on the
 * VPS hardware.
 */
export const llmGuardScanDurationSeconds = new Histogram({
  name: 'musaium_llm_guard_scan_duration_seconds',
  help: 'Duration of LLM Guard /scan HTTP calls in seconds, labeled by path + outcome.',
  labelNames: ['path', 'outcome'] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 3],
  registers: [registry],
});

/**
 * C4 anti-hallucination (2026-05-11) — citation grounding + WebSearch fallback
 * surface mandated by `spec.md §R12 / NFR6` and `design.md §10 Observability`.
 *
 * Cardinality budget (all four counters, summed):
 *   - `chat_sources_emitted_total{type}`            ∈ {wikidata, web, museum-catalog, commons} → 4 series
 *   - `chat_sources_rejected_total{reason}`         ∈ {quote-not-found, quote-too-short}      → 2 series
 *   - `chat_websearch_fallback_total{outcome}`      ∈ {hit, empty, error}                      → 3 series
 *   - `chat_url_head_probe_total{cache_hit,outcome}` ∈ {true,false} × {reachable, unreachable}  → 4 series
 * Total active series ≤ 13. Comfortably within the spec NFR cardinality budget.
 *
 * Call sites:
 *   - `chat_sources_emitted_total` → `useCase/orchestration/message-commit.ts`
 *     (incremented per surviving source after the anti-hallucination filters).
 *   - `chat_sources_rejected_total` → `useCase/orchestration/sources-validator.ts`
 *     (replaces the deferred-instrumentation marker dated T2.4).
 *   - `chat_websearch_fallback_total` → `useCase/knowledge/knowledge-router.service.ts`
 *     (incremented once per resolve() on the WS leg outcome).
 *   - `chat_url_head_probe_total` → `useCase/orchestration/url-head-probe.ts`
 *     (replaces the deferred-instrumentation marker dated T2.5).
 */
export const chatSourcesEmittedTotal = new Counter({
  name: 'chat_sources_emitted_total',
  help: 'Total citation sources attached to a chat assistant response, by source type',
  labelNames: ['type'] as const,
  registers: [registry],
});

export const chatSourcesRejectedTotal = new Counter({
  name: 'chat_sources_rejected_total',
  help: 'Total citation sources dropped by the anti-hallucination validator, by rejection reason',
  labelNames: ['reason'] as const,
  registers: [registry],
});

export const chatWebsearchFallbackTotal = new Counter({
  name: 'chat_websearch_fallback_total',
  help: 'Total knowledge-router WebSearch fallback invocations, by outcome (hit / empty / error)',
  labelNames: ['outcome'] as const,
  registers: [registry],
});

export const chatUrlHeadProbeTotal = new Counter({
  name: 'chat_url_head_probe_total',
  help: 'Total citation URL reachability probes, partitioned by cache_hit + outcome',
  labelNames: ['cache_hit', 'outcome'] as const,
  registers: [registry],
});

/**
 * Scalability primitives surface (perennial design §11 / 100k clients prep,
 * 2026-05-13). Four series families, all with bounded cardinality :
 *
 *   - `musaium_guardrail_budget_redis_fallback_total` (Counter, labelless) —
 *     incremented every time the guardrail-budget Redis backend has to
 *     fail-CLOSED because the cache is unreachable / corrupted. Drives a
 *     Redis-availability alert (LLM10 unbounded-consumption hardening from
 *     ADR-030 §Phase 2 + ADR-015 known gap). 1 active series.
 *
 *   - `musaium_llm_cost_circuit_breaker_state{state}` (Gauge) — holds 1 for
 *     the active state and 0 for the other two. `state` ∈ {closed,
 *     half_open, open}. 3 active series.
 *
 *   - `musaium_llm_cost_circuit_breaker_trips_total` (Counter, labelless) —
 *     incremented on each transition to OPEN (cost spike or daily cap
 *     breach). 1 active series.
 *
 *   - `musaium_tenant_rate_limit_rejects_total{tenant_id}` (Counter) —
 *     cardinality bounded by the live tenant population (Phase 2 ≤ ~20 +
 *     `anonymous`); V1 not wired, so 0 active series until the multi-tenant
 *     path lands.
 *
 * Total active series ≤ 5 in V1, +N tenants when wired (Phase 2).
 */
export const guardrailBudgetRedisFallbackTotal = new Counter({
  name: 'musaium_guardrail_budget_redis_fallback_total',
  help: 'Total guardrail-budget Redis backend fail-CLOSED fallbacks (unreachable / corrupted counter)',
  registers: [registry],
});

export const llmCostCircuitBreakerState = new Gauge({
  name: 'musaium_llm_cost_circuit_breaker_state',
  help: 'Current state of the LLM cost circuit breaker. 1 = active state, 0 = inactive.',
  labelNames: ['state'] as const,
  registers: [registry],
});

export const llmCostCircuitBreakerTripsTotal = new Counter({
  name: 'musaium_llm_cost_circuit_breaker_trips_total',
  help: 'Total transitions of the LLM cost circuit breaker into OPEN (cost spike or daily cap breach)',
  registers: [registry],
});

export const tenantRateLimitRejectsTotal = new Counter({
  name: 'musaium_tenant_rate_limit_rejects_total',
  help: 'Total per-tenant rate-limit rejects. Cardinality bounded by live tenant population.',
  labelNames: ['tenant_id'] as const,
  registers: [registry],
});

/**
 * Per-locale bias monitoring foundation counter (FAIRNESS_METRICS_PLAN.md Phase 1,
 * `team-state/2026-05-12-llm-guard-perennial-10y-design/compliance-research-bias-monitoring.md`).
 *
 * Foundation source-of-truth for every block-rate derivation. The block rate
 * per locale is NOT a separate gauge — it is a Prometheus recording rule
 * computed as
 *   `avg(rate(decisions{decision="block"}[1h]) / rate(decisions[1h])) by (locale)`.
 * Using `total_blocks / total_requests` (without the per-locale avg) is the
 * methodological pitfall flagged in the research subagent §3 — it inflates
 * disparity for high-volume locales and hides it for low-volume ones.
 *
 * Cardinality (worst case):
 *   - `locale`   ∈ {ar, de, en, es, fr, it, ja, zh, unknown}  → 9 values
 *   - `layer`    ∈ {keyword, sidecar, judge, art-topic, sanitizer} → 5 values
 *   - `decision` ∈ {allow, block}                                  → 2 values
 * 9 × 5 × 2 = 90 active series — within the 200-budget set in the NFR table.
 *
 * Aligned with the AI Act Art. 10 (data governance) requirement for
 * high-risk systems: providers must have in place "measures to detect,
 * prevent and mitigate identified biases". A block-rate disparity with no
 * monitoring record is a compliance gap regardless of cause.
 */
export const guardrailDecisionsTotal = new Counter({
  name: 'musaium_guardrail_decisions_total',
  help: 'Total guardrail decisions, labelled by locale, layer, decision. Foundation for block-rate derivations.',
  labelNames: ['locale', 'layer', 'decision'] as const,
  registers: [registry],
});

/**
 * Per-locale category block volume — distinguishes false-positive inflation
 * (calibration bug, e.g. a keyword bank tuned on French content over-flagging
 * Arabic calligraphy discussions) from legitimate content concentration
 * (some cultural corpora genuinely have more content touching sensitive
 * historical events).
 *
 * Categories collapse `GuardrailBlockReason` into a stable bias taxonomy:
 *   - `insult`             — direct user offence
 *   - `prompt_injection`   — jailbreak / injection / data_exfiltration
 *   - `off_topic`          — soft channel (art-topic classifier + judge off-topic)
 *   - `unsafe_output`      — non-PII unsafe output (toxicity, bias, schema, etc.)
 *   - `service_unavailable` — sidecar fail-CLOSED (not a content-quality block —
 *                              still tracked for parity so locale disparity in
 *                              upstream failure can be observed too)
 *   - `other`              — any reason that does not map (safety net for future)
 *
 * Cardinality: 9 locales × ≤7 categories = ≤63 active series — within budget.
 */
export const guardrailCategoryBlocksTotal = new Counter({
  name: 'musaium_guardrail_category_blocks_total',
  help: 'Total guardrail blocks by locale and category. Diagnoses FP inflation vs legitimate concentration.',
  labelNames: ['locale', 'category'] as const,
  registers: [registry],
});

/**
 * LLM02 — count of effective PII redactions on chat input.
 *
 * Cardinality: 9 locales × ≤12 entity types (Presidio `ANONYMIZE_ENTITIES`
 * list from `museum-backend/ops/llm-guard-sidecar/app.py:42-45` + `unknown`).
 * Bounded ≤108 active series. Drives the operator alert on PII-attack waves
 * (e.g. wallet harvesting via `CRYPTO` spikes).
 */
export const guardrailPiiRedactedTotal = new Counter({
  name: 'musaium_guardrail_pii_redacted_total',
  help: 'Total effective PII redactions on chat input, by locale and entity type (placeholder).',
  labelNames: ['locale', 'placeholder_type'] as const,
  registers: [registry],
});

/**
 * LLM Guard chaos-injection counter (Phase 1 chaos engineering primitive).
 *
 * Increments each time the configured `GUARDRAIL_CHAOS_RATE` triggers a
 * simulated abort BEFORE the sidecar fetch. Pair with
 * `musaium_llm_guard_scan_duration_seconds{outcome="timeout"}` and
 * `musaium_guardrail_decisions_total{decision="block"}` to validate the
 * fail-CLOSED path. `chaosRate` MUST be 0 in production — non-zero values
 * intentionally degrade availability to exercise resilience drills.
 *
 * Cardinality: 1 active series (labelless).
 */
export const llmGuardChaosInjectionsTotal = new Counter({
  name: 'musaium_llm_guard_chaos_injections_total',
  help: 'Total LLM Guard /scan calls that were chaos-aborted before reaching the sidecar (GUARDRAIL_CHAOS_RATE).',
  registers: [registry],
});

/** Returns the Prometheus-format metrics dump. */
export async function renderMetrics(): Promise<string> {
  return await registry.metrics();
}
