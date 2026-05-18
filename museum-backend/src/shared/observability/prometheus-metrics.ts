import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

import { logger } from '@shared/logger/logger';
import { getDataSourceForMetrics } from '@shared/observability/metrics-context';

export const registry = new Registry();

let defaultMetricsRegistered = false;

/**
 * Enables default Node.js process metrics. Idempotent. Call ONCE from app bootstrap.
 *
 * WHY explicit: `prom-client` registers setInterval-based collectors that don't `.unref()`,
 * which kept Node alive past test/Stryker mutant runs and broke Stryker's hot-reload throughput
 * (forced spawn-per-mutant fallback, ~10x slowdown).
 */
export function enableDefaultMetrics(): void {
  if (defaultMetricsRegistered) return;
  collectDefaultMetrics({ register: registry });
  defaultMetricsRegistered = true;
}

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests served',
  labelNames: ['route', 'status', 'method'] as const,
  registers: [registry],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['route', 'method'] as const,
  buckets: [0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

export const llmCacheHitsTotal = new Counter({
  name: 'llm_cache_hits_total',
  help: 'Total LLM response cache hits',
  labelNames: ['context_class'] as const,
  registers: [registry],
});

export const llmCacheMissesTotal = new Counter({
  name: 'llm_cache_misses_total',
  help: 'Total LLM response cache misses',
  labelNames: ['context_class'] as const,
  registers: [registry],
});

/** C1 — Cardinality bounded to `phase` × `provider` (≤ 200 series, spec NFR). */
export const chatPhaseDurationSeconds = new Histogram({
  name: 'chat_phase_duration_seconds',
  help: 'Chat pipeline phase latency in seconds (stt, llm, tts)',
  labelNames: ['phase', 'provider'] as const,
  buckets: [0.1, 0.25, 0.5, 1, 1.5, 2, 3, 5, 8, 12],
  registers: [registry],
});

/** C1 — outcome ∈ {success, error, guardrail_blocked, circuit_open, cache_hit}. */
export const chatRequestDurationSeconds = new Histogram({
  name: 'chat_request_duration_seconds',
  help: 'Chat request end-to-end latency in seconds, by outcome',
  labelNames: ['outcome'] as const,
  registers: [registry],
});

/** C1 — `error_type` is a stable taxonomy (timeout, upstream_5xx, abort, unknown), not raw message. */
export const chatPhaseErrorsTotal = new Counter({
  name: 'chat_phase_errors_total',
  help: 'Total chat pipeline phase errors, by phase/provider/error_type',
  labelNames: ['phase', 'provider', 'error_type'] as const,
  registers: [registry],
});

/**
 * C2 v2 — `source` ∈ {wikidata, unsplash, commons, musaium}, `outcome` ∈ {success, error, timeout, disabled}.
 * Total active series ≤ 16. Increment in `ImageEnrichmentService.fetchSourcePhotos`.
 */
export const chatEnrichmentSourceCallsTotal = new Counter({
  name: 'chat_enrichment_source_calls_total',
  help: 'Total image-enrichment source-client calls, by source and outcome',
  labelNames: ['source', 'outcome'] as const,
  registers: [registry],
});

export const chatEnrichmentSourceLatencySeconds = new Histogram({
  name: 'chat_enrichment_source_latency_seconds',
  help: 'Image-enrichment source-client latency in seconds, by source',
  labelNames: ['source'] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 3, 5, 8],
  registers: [registry],
});

/**
 * C3 visual similarity — Cardinality bounded:
 *   - `duration_seconds.stage` ∈ {total, encode, search, enrich, fusion} → 5
 *   - `fallback_total.reason`  ∈ {encoder_unavailable, no_visual_neighbor} → 2
 * Total compare-namespaced active series ≤ 9.
 */
export const compareRequestsTotal = new Counter({
  name: 'compare_requests_total',
  help: 'Total /chat/compare requests reaching the use-case (post-auth, post-rate-limit)',
  registers: [registry],
});

export const compareDurationSeconds = new Histogram({
  name: 'compare_duration_seconds',
  help: 'Per-stage latency of the /chat/compare pipeline',
  labelNames: ['stage'] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 1.5, 2, 3, 5, 8],
  registers: [registry],
});

/** Contractual fallback paths only (encoder unavailable, no neighbour). 4xx tracked via http_requests_total. */
export const compareFallbackTotal = new Counter({
  name: 'compare_fallback_total',
  help: 'Total /chat/compare requests that returned a contractual fallback envelope',
  labelNames: ['reason'] as const,
  registers: [registry],
});

export const compareCacheHitsTotal = new Counter({
  name: 'compare_cache_hits_total',
  help: 'Total /chat/compare requests served from the top-K result cache (no encoder/repo hit)',
  registers: [registry],
});

/**
 * C3 catalogue size — refreshed SYNCHRONOUSLY on every /metrics scrape (no scheduler).
 * Fail-open: if DataSource not wired or SELECT rejects, gauge keeps previous value
 * rather than reset to 0 — avoids spurious "catalog drift" alerts on transient DB blips.
 * Exact count (not pg_class.reltuples estimate) — OK at V1 scale (~10k rows, indexed, ≪10ms).
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
 * C5 Wikidata résilience (ADR-039). Cardinality strictly bounded:
 *   - circuit_state.state ∈ {closed, open, half_open} (Gauge 1/0 per active state)
 *   - requests_total.outcome ∈ {success, error, timeout, circuit_open, rate_limit}
 *   - request_duration: labelless ; reject events do NOT observe (action never ran)
 *   - cache/local-dump hits/misses: labelless, single-tier
 * NO search-term and NO QID labels — both are unbounded user-derived strings.
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
 * LLM Guard sidecar circuit breaker (2026-05-12 incident response).
 * The breaker primitive itself stays Prometheus-free (separation of concerns) — Gauge `set()`
 * and Counter `inc()` happen in the `onStateChange` callback wired in `chat-module.ts`.
 * Cardinality ≤ 4 series.
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
 * ADR-047 — fail-CLOSED preserved (R1). reason ∈ {breaker, overflow} (breaker FSM forbids /
 * inflight semaphore queue full). Both return {allow:false, reason:'error'}.
 */
export const llmGuardCircuitBreakerSkipsTotal = new Counter({
  name: 'musaium_llm_guard_circuit_breaker_skips_total',
  help: 'Total /scan calls short-circuited before reaching the sidecar. reason in {breaker, overflow}.',
  labelNames: ['path', 'reason'] as const,
  registers: [registry],
});

/**
 * /scan latency — leading indicator (alerts can page on p95 before breaker trips).
 * outcome ∈ {success, fail_closed, timeout, breaker_skip, overflow}.
 * breaker_skip/overflow observed at 0s.
 */
export const llmGuardScanDurationSeconds = new Histogram({
  name: 'musaium_llm_guard_scan_duration_seconds',
  help: 'Duration of LLM Guard /scan HTTP calls in seconds, labeled by path + outcome.',
  labelNames: ['path', 'outcome'] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 3],
  registers: [registry],
});

/**
 * C4 anti-hallucination — citation grounding + WebSearch fallback (spec NFR6).
 * Cardinality ≤ 13 series. Call sites:
 *   - sources_emitted → message-commit.ts (per surviving source post-filters)
 *   - sources_rejected → sources-validator.ts
 *   - websearch_fallback → knowledge-router.service.ts (once per resolve() on WS leg)
 *   - url_head_probe → url-head-probe.ts
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
 * Scalability primitives (100k clients prep, 2026-05-13).
 *   - guardrail_budget_redis_fallback: fail-CLOSED count (drives Redis-availability alert,
 *     ADR-030 §Phase 2 LLM10 hardening + ADR-015 known gap)
 *   - llm_cost_circuit_breaker_state: state ∈ {closed, half_open, open}, Gauge 1/0
 *   - llm_cost_circuit_breaker_trips: tx to OPEN (cost spike or daily cap breach)
 *   - tenant_rate_limit_rejects: bounded by live tenant population (Phase 2 ≤ ~20 + anonymous)
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

/**
 * C9.4 — Rolling 1h LLM spend in EUR-equivalent, partitioned by user tier +
 * museum. V1 uses USD list prices as a EUR proxy (1 USD ≈ 1 EUR within ±10%
 * — acceptable for spike detection alerting, NOT for billing reconciliation).
 * Source: `LlmCostCircuitBreaker.getState().hourlySpendCents / 100`.
 * Cardinality budget: 4 tiers × ~51 museum_ids ≤ 204 series.
 */
export const llmCostEurPerHour = new Gauge({
  name: 'musaium_llm_cost_eur_per_hour',
  help: 'Rolling 1h LLM spend in EUR (V1 uses USD pricing as EUR proxy, ±10%). NOT for billing.',
  labelNames: ['tier', 'museum_id'] as const,
  registers: [registry],
});

export const tenantRateLimitRejectsTotal = new Counter({
  name: 'musaium_tenant_rate_limit_rejects_total',
  help: 'Total per-tenant rate-limit rejects. Cardinality bounded by live tenant population.',
  labelNames: ['tenant_id'] as const,
  registers: [registry],
});

/**
 * Per-locale bias monitoring (FAIRNESS_METRICS_PLAN.md Phase 1, AI Act Art. 10).
 *
 * Block rate is a Prometheus recording rule:
 *   `avg(rate(decisions{decision="block"}[1h]) / rate(decisions[1h])) by (locale)`
 * NOT `total_blocks / total_requests` — that pitfall inflates disparity for high-volume
 * locales and hides it for low-volume ones.
 *
 * Cardinality: 9 locales × 5 layers × 2 decisions = 90 series (within 200 budget).
 */
export const guardrailDecisionsTotal = new Counter({
  name: 'musaium_guardrail_decisions_total',
  help: 'Total guardrail decisions, labelled by locale, layer, decision. Foundation for block-rate derivations.',
  labelNames: ['locale', 'layer', 'decision'] as const,
  registers: [registry],
});

/**
 * Distinguishes FP inflation (e.g. FR-tuned keyword bank over-flagging AR calligraphy)
 * from legitimate content concentration. Categories collapse `GuardrailBlockReason` into
 * stable bias taxonomy: insult / prompt_injection / off_topic / unsafe_output /
 * service_unavailable / other. Cardinality: 9 × ≤7 = ≤63 series.
 */
export const guardrailCategoryBlocksTotal = new Counter({
  name: 'musaium_guardrail_category_blocks_total',
  help: 'Total guardrail blocks by locale and category. Diagnoses FP inflation vs legitimate concentration.',
  labelNames: ['locale', 'category'] as const,
  registers: [registry],
});

/**
 * LLM02 — PII redaction count. Cardinality: 9 locales × ≤12 entity types
 * (Presidio ANONYMIZE_ENTITIES from `ops/llm-guard-sidecar/app.py:42-45` + unknown) ≤108.
 * Drives operator alert on PII-attack waves (e.g. wallet harvesting via CRYPTO spikes).
 */
export const guardrailPiiRedactedTotal = new Counter({
  name: 'musaium_guardrail_pii_redacted_total',
  help: 'Total effective PII redactions on chat input, by locale and entity type (placeholder).',
  labelNames: ['locale', 'placeholder_type'] as const,
  registers: [registry],
});

/**
 * Chaos-injection counter. `chaosRate` MUST be 0 in production — non-zero intentionally
 * degrades availability for resilience drills. Pair with scan_duration{outcome="timeout"}
 * and decisions{decision="block"} to validate fail-CLOSED path.
 */
export const llmGuardChaosInjectionsTotal = new Counter({
  name: 'musaium_llm_guard_chaos_injections_total',
  help: 'Total LLM Guard /scan calls that were chaos-aborted before reaching the sidecar (GUARDRAIL_CHAOS_RATE).',
  registers: [registry],
});

/**
 * W3 (geo + walk + intra-musée) metrics. Cardinality:
 *   - geo_detect_museum_total.outcome ∈ {hit-geofence, hit-haversine, miss} → 3 series
 *   - nominatim_requests_total.outcome ∈ {hit, miss, error, cached}        → 4 series
 *   - nominatim_request_duration_seconds                                     → 1 histogram
 * Total ≤ 8 active series, well under the 200 budget.
 */
export const geoDetectMuseumTotal = new Counter({
  name: 'geo_detect_museum_total',
  help: 'Total /api/museums/detect-museum invocations, by outcome (hit-geofence, hit-haversine, miss).',
  labelNames: ['outcome'] as const,
  registers: [registry],
});

export const nominatimRequestsTotal = new Counter({
  name: 'nominatim_requests_total',
  help: 'Total Nominatim reverse-geocode requests, by outcome (hit, miss, error, cached).',
  labelNames: ['outcome'] as const,
  registers: [registry],
});

export const nominatimRequestDurationSeconds = new Histogram({
  name: 'nominatim_request_duration_seconds',
  help: 'Nominatim reverse-geocode latency in seconds (live calls only ; cache hits not observed).',
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 3, 5],
  registers: [registry],
});

/**
 * C9.13 (2026-05-18) — cross-encoder rerank step instrumentation. Two metrics
 * scoped narrowly to the rerank phase (KR `runWebSearchLeg` + VS `compare`):
 *  - `musaium_rerank_latency_ms` histogram (per-call wall time, labels
 *    `caller` ∈ {`knowledge-router`, `visual-similarity`}, `outcome` ∈
 *    {`success`, `fallback`}).
 *  - `musaium_rerank_fallback_total` counter (incremented when reranker
 *    throws / times out and caller falls back to baseline; label `reason`
 *    ∈ {`unavailable`, `timeout`, `error`}).
 *
 * Cardinality cap: 2 callers × 2 outcomes = 4 series (latency) + 2 × 3 = 6
 * series (fallback). Bucket scale matches existing latency histograms.
 */
export const rerankLatencyMs = new Histogram({
  name: 'musaium_rerank_latency_ms',
  help: 'Wall-clock latency (ms) of a single reranker invocation, labelled by caller and outcome.',
  labelNames: ['caller', 'outcome'] as const,
  buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [registry],
});

export const rerankFallbackTotal = new Counter({
  name: 'musaium_rerank_fallback_total',
  help: 'Total rerank calls that fell back to baseline ordering, labelled by caller and reason.',
  labelNames: ['caller', 'reason'] as const,
  registers: [registry],
});

export async function renderMetrics(): Promise<string> {
  return await registry.metrics();
}
