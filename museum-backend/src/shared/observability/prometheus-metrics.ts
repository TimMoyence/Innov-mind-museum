import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

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

/** Returns the Prometheus-format metrics dump. */
export async function renderMetrics(): Promise<string> {
  return await registry.metrics();
}
