import CircuitBreaker from 'opossum';

import { logger } from '@shared/logger/logger';
import {
  wikidataSparqlCircuitState,
  wikidataSparqlRequestsTotal,
  wikidataSparqlRequestDurationSeconds,
} from '@shared/observability/prometheus-metrics';

import { WikidataTransientError } from './wikidata.client';

import type { WikidataClient } from './wikidata.client';
import type { BreakerState, BreakerStateName } from '@modules/chat/domain/breaker-state';
import type {
  ArtworkFacts,
  KnowledgeBaseProvider,
  KnowledgeBaseQuery,
} from '@modules/chat/domain/ports/knowledge-base.port';

export type { BreakerState, BreakerStateName };

/**
 * C5 doctrine pre-launch V1 — no `enabled` flag: rollback = `git revert` of Step 2.3
 * wiring, not a runtime toggle. Every field is a tuning value, never a switch.
 */
export interface WikidataBreakerConfig {
  timeoutMs: number;
  /** Error % in rolling window required to open the breaker. */
  errorThresholdPercentage: number;
  /** Cooldown before OPEN → HALF_OPEN. */
  resetTimeoutMs: number;
  /** Minimum calls in rolling window before % is evaluated. */
  volumeThreshold: number;
  /** Maximum concurrent in-flight calls (bulkhead). */
  capacity: number;
}

type LookupFn = (query: KnowledgeBaseQuery) => Promise<ArtworkFacts | null>;

/**
 * Bounded to 5 to cap `/metrics` series. Adding a variant requires Grafana dashboard
 * + alerting rules update (`infra/grafana/`).
 */
type SparqlOutcome = 'success' | 'error' | 'timeout' | 'circuit_open' | 'rate_limit';

/** Opossum 9.x timeout error message — used to dedupe `failure` follow-ups. */
const OPOSSUM_TIMEOUT_RE = /^Timed out after \d+ms$/;

const STATE_LABEL_VALUES = ['closed', 'open', 'half_open'] as const;
type CircuitStateLabel = (typeof STATE_LABEL_VALUES)[number];

/**
 * Opossum circuit breaker around `WikidataClient.lookupOrThrow`. Drop-in
 * `KnowledgeBaseProvider` for `KnowledgeBaseService`.
 *
 * Semantics: `WikidataTransientError` (network/408/429/5xx) counts toward
 * `errorThresholdPercentage`. Legitimate `null` (no match, 4xx-non-retryable,
 * invalid QID) resolves as success, does NOT trip. When OPEN, opossum `fallback`
 * returns `null` without invoking inner — fail-open preserved (ADR-035).
 *
 * Observability (C5 Phase 6.2) bridges opossum events to Prometheus:
 * - success/timeout/rate_limit/error → `wikidata_sparql_requests_total{outcome}` +
 *   `wikidata_sparql_request_duration_seconds`.
 * - reject → `outcome="circuit_open"` (no duration, action never ran).
 * - open/halfOpen/close → set `wikidata_sparql_circuit_state` label.
 * - Every metric write try/catched — prom-client throw never propagates to chat
 *   path (fail-open UFR-013, same as `chat-phase-timer.ts:159-165`).
 */
export class WikidataBreakerClient implements KnowledgeBaseProvider {
  private readonly breaker: CircuitBreaker<[KnowledgeBaseQuery], ArtworkFacts | null>;
  private openSince?: number;
  /**
   * Opossum emits BOTH `timeout` AND `failure` for the same call — `failure`
   * listener consults this flag and exits early to avoid double-count.
   */
  private timeoutDedupe = false;
  /** TD-OP-01 — guards `dispose()` idempotency (second call no-ops). */
  private disposed = false;

  constructor(
    private readonly inner: WikidataClient,
    config: WikidataBreakerConfig,
  ) {
    const action: LookupFn = (query) => this.inner.lookupOrThrow(query);

    this.breaker = new CircuitBreaker(action, {
      timeout: config.timeoutMs,
      errorThresholdPercentage: config.errorThresholdPercentage,
      resetTimeout: config.resetTimeoutMs,
      volumeThreshold: config.volumeThreshold,
      capacity: config.capacity,
      name: 'wikidata-sparql',
      // TD-OP-03 — groups related breakers in the opossum hystrix-stats stream
      // for dashboard aggregation (lib-docs/opossum/PATTERNS.md §3).
      group: 'knowledge-base',
    });

    this.breaker.fallback(() => null);

    // Seed the gauge so dashboards have a value before the first transition.
    this.setCircuitStateGauge('closed');

    this.breaker.on('open', () => {
      this.openSince = Date.now();
      this.setCircuitStateGauge('open');
    });
    this.breaker.on('halfOpen', () => {
      // openSince retained — cascade soak window still references the original open timestamp.
      this.setCircuitStateGauge('half_open');
    });
    this.breaker.on('close', () => {
      this.openSince = undefined;
      this.setCircuitStateGauge('closed');
    });

    this.breaker.on('success', (_result, latencyMs) => {
      this.timeoutDedupe = false;
      this.recordOutcome('success');
      this.observeDuration(latencyMs);
    });

    this.breaker.on('timeout', () => {
      this.timeoutDedupe = true;
      this.recordOutcome('timeout');
      // @types/opossum 8.x types listener as `(err)` only; opossum 9.x runtime also
      // passes latency. Approximate via configured `timeoutMs` (bound, actual ≤).
      this.observeDuration(config.timeoutMs);
    });

    this.breaker.on('failure', (err, latencyMs) => {
      if (this.timeoutDedupe) {
        // 'timeout' already fired for this call; opossum follows with
        // 'failure(Error("Timed out after Nms"))'. Already counted.
        this.timeoutDedupe = false;
        return;
      }
      // Defensive: if per-call timeout fires without 'timeout' observed first
      // (future opossum quirk), error message still pattern-matches.
      if (err instanceof Error && OPOSSUM_TIMEOUT_RE.test(err.message)) {
        this.recordOutcome('timeout');
        this.observeDuration(latencyMs);
        return;
      }
      const outcome: SparqlOutcome = this.isRateLimit(err) ? 'rate_limit' : 'error';
      this.recordOutcome(outcome);
      this.observeDuration(latencyMs);
    });

    this.breaker.on('reject', () => {
      this.recordOutcome('circuit_open');
      // No duration observation — the action never ran.
    });
  }

  /** Returns `null` when OPEN. */
  async lookup(query: KnowledgeBaseQuery): Promise<ArtworkFacts | null> {
    const result = await this.breaker.fire(query);
    return result ?? null;
  }

  /**
   * `openSince` set on OPEN, cleared on CLOSE; during HALF_OPEN carries original
   * OPEN timestamp so `LOCAL_DUMP_FALLBACK_AFTER_MS` soak window stays anchored.
   */
  getState(): BreakerState {
    if (this.breaker.opened) return { name: 'OPEN', openSince: this.openSince };
    if (this.breaker.halfOpen) return { name: 'HALF_OPEN', openSince: this.openSince };
    return { name: 'CLOSED' };
  }

  /**
   * TD-OP-01 — releases the opossum rolling-stats `setInterval` by calling
   * `breaker.shutdown()` (PATTERNS.md §2 "terminate breaker, remove listeners";
   * LESSONS.md F1). Without this every constructed client leaks that timer —
   * the Stryker/Jest open-handle gotcha (CLAUDE.md § Stryker). Wired into the
   * graceful-shutdown drain via `stopWikidataBreaker()` and exercised by the
   * test suite's `afterEach`. Idempotent: a second call is a no-op (the breaker
   * is already shut down).
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.breaker.shutdown();
  }

  private isRateLimit(err: unknown): boolean {
    if (!(err instanceof WikidataTransientError)) return false;
    const cause = err.cause;
    if (!cause || typeof cause !== 'object') return false;
    return (cause as { status?: number }).status === 429;
  }

  private recordOutcome(outcome: SparqlOutcome): void {
    try {
      wikidataSparqlRequestsTotal.inc({ outcome });
    } catch (err) {
      logger.warn('wikidata_breaker_metric_drop', {
        metric: 'wikidata_sparql_requests_total',
        outcome,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private observeDuration(latencyMs: number): void {
    try {
      wikidataSparqlRequestDurationSeconds.observe(Math.max(0, latencyMs) / 1000);
    } catch (err) {
      logger.warn('wikidata_breaker_metric_drop', {
        metric: 'wikidata_sparql_request_duration_seconds',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private setCircuitStateGauge(active: CircuitStateLabel): void {
    for (const state of STATE_LABEL_VALUES) {
      try {
        wikidataSparqlCircuitState.set({ state }, state === active ? 1 : 0);
      } catch (err) {
        logger.warn('wikidata_breaker_metric_drop', {
          metric: 'wikidata_sparql_circuit_state',
          state,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}
