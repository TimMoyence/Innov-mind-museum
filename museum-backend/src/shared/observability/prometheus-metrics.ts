import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Prometheus metrics registry. Holds the RED metrics + business metrics
 * surfaced via the /metrics endpoint.
 *
 * Spec: docs/superpowers/specs/2026-05-01-H-observability-design.md
 */
export const registry = new Registry();

// Default Node.js process metrics (CPU, memory, event-loop lag, etc).
collectDefaultMetrics({ register: registry });

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

/** Returns the Prometheus-format metrics dump. */
export async function renderMetrics(): Promise<string> {
  return await registry.metrics();
}
