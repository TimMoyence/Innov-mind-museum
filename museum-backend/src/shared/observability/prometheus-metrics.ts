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

/** Returns the Prometheus-format metrics dump. */
export async function renderMetrics(): Promise<string> {
  return await registry.metrics();
}
