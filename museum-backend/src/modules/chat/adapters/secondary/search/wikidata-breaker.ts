import CircuitBreaker from 'opossum';

import { logger } from '@shared/logger/logger';
import {
  wikidataSparqlCircuitState,
  wikidataSparqlRequestsTotal,
  wikidataSparqlRequestDurationSeconds,
} from '@shared/observability/prometheus-metrics';

import { WikidataTransientError } from './wikidata.client';

import type { WikidataClient } from './wikidata.client';
import type { BreakerState, BreakerStateName } from '@modules/chat/domain/breaker/breaker-state';
import type {
  ArtworkFacts,
  KnowledgeBaseProvider,
  KnowledgeBaseQuery,
} from '@modules/chat/domain/ports/knowledge-base.port';

export type { BreakerState, BreakerStateName };

/**
 * Tuning knobs for the Wikidata SPARQL/API circuit breaker.
 *
 * C5 doctrine pré-launch V1 — no `enabled` flag : rollback = `git revert` of
 * the Step 2.3 wiring, not a runtime toggle. Every field is a tuning value
 * (timeouts, thresholds, capacity), never a switch.
 */
export interface WikidataBreakerConfig {
  /** Per-call timeout (ms) before opossum rejects with timeout error. */
  timeoutMs: number;
  /** Error % within the rolling window required to open the breaker. */
  errorThresholdPercentage: number;
  /** Cooldown (ms) before transitioning OPEN → HALF_OPEN. */
  resetTimeoutMs: number;
  /** Minimum number of calls in the rolling window before % is evaluated. */
  volumeThreshold: number;
  /** Maximum concurrent in-flight calls (bulkhead). */
  capacity: number;
}

type LookupFn = (query: KnowledgeBaseQuery) => Promise<ArtworkFacts | null>;

/**
 * Stable taxonomy for the `outcome` Prom label on
 * `wikidata_sparql_requests_total`. Kept small (5) to bound the active series
 * count surfaced via `/metrics`. Adding a variant requires updating the
 * Grafana dashboard + alerting rules together (`infra/grafana/`).
 */
type SparqlOutcome = 'success' | 'error' | 'timeout' | 'circuit_open' | 'rate_limit';

/** Opossum 9.x timeout error message. Used to dedupe `failure` follow-ups. */
const OPOSSUM_TIMEOUT_RE = /^Timed out after \d+ms$/;

const STATE_LABEL_VALUES = ['closed', 'open', 'half_open'] as const;
type CircuitStateLabel = (typeof STATE_LABEL_VALUES)[number];

/**
 * Decorator wrapping {@link WikidataClient.lookupOrThrow} with an
 * [opossum](https://nodeshift.dev/opossum) circuit breaker. Implements
 * {@link KnowledgeBaseProvider} so it is a drop-in replacement for the
 * raw client at the {@link KnowledgeBaseService} injection point.
 *
 * Semantics :
 * - {@link WikidataTransientError} thrown from the inner client (network /
 *   408 / 429 / 5xx) counts toward `errorThresholdPercentage`.
 * - Legitimate `null` returns (no match, 4xx-non-retryable, invalid QID)
 *   resolve as success and do NOT trip the breaker.
 * - When OPEN, the opossum `fallback` returns `null` without invoking
 *   the inner client — fail-open preserved (ADR-035 contract).
 *
 * Observability (C5 Phase 6.2) — opossum events are bridged to the
 * Prometheus surface declared in `shared/observability/prometheus-metrics.ts` :
 * - `success(_, latencyMs)` → `wikidata_sparql_requests_total{outcome="success"}`
 *   + `wikidata_sparql_request_duration_seconds` observation.
 * - `failure(err, latencyMs)` → classify : opossum's own timeout error
 *   (`/Timed out after \d+ms/`) becomes `outcome="timeout"` ; a wrapped
 *   429 transient becomes `outcome="rate_limit"` ; everything else is
 *   `outcome="error"`. Duration is observed for all three.
 * - `reject()` → `outcome="circuit_open"` (no duration — the action never
 *   ran). Fires whenever the breaker is OPEN or capacity is exceeded.
 * - `open` / `halfOpen` / `close` → set the corresponding label on
 *   `wikidata_sparql_circuit_state` to 1 and the others to 0.
 * - Every metric write is wrapped in try/catch ; a prom-client throw
 *   never propagates into the chat path (fail-open per UFR-013, same
 *   pattern as `chat-phase-timer.ts:159-165`).
 */
export class WikidataBreakerClient implements KnowledgeBaseProvider {
  private readonly breaker: CircuitBreaker<[KnowledgeBaseQuery], ArtworkFacts | null>;
  private openSince?: number;
  /**
   * Sentinel marking the latest call that has already been counted as
   * `outcome="timeout"`. Opossum emits both `timeout` and `failure` for the
   * same call ; the `failure` listener consults this flag and exits early
   * when set, avoiding double-count.
   */
  private timeoutDedupe = false;

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
      // @types/opossum 8.x types the timeout listener with only `(err: Error)`,
      // but the opossum 9.x runtime also passes latency as the 2nd arg. We
      // approximate via the configured `timeoutMs` (precise enough — timeout
      // is the bound, actual latency is ≤ that bound by construction).
      this.observeDuration(config.timeoutMs);
    });

    this.breaker.on('failure', (err, latencyMs) => {
      if (this.timeoutDedupe) {
        // 'timeout' fired for this same call ; opossum follows up with
        // 'failure(Error("Timed out after Nms"))'. Already counted.
        this.timeoutDedupe = false;
        return;
      }
      // Defensive secondary check : if the breaker's per-call timeout fires
      // without our handler observing it first (e.g. a future opossum quirk),
      // the error message still pattern-matches.
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

  /** Delegates to the inner client through the breaker ; returns `null` when OPEN. */
  async lookup(query: KnowledgeBaseQuery): Promise<ArtworkFacts | null> {
    const result = await this.breaker.fire(query);
    return result ?? null;
  }

  /**
   * Snapshot of the breaker state for the downstream cascade (Step 5.1).
   * `openSince` is set when the breaker enters OPEN and cleared on CLOSE ;
   * during HALF_OPEN it carries the original OPEN timestamp so the
   * `LOCAL_DUMP_FALLBACK_AFTER_MS` soak window remains anchored.
   */
  getState(): BreakerState {
    if (this.breaker.opened) return { name: 'OPEN', openSince: this.openSince };
    if (this.breaker.halfOpen) return { name: 'HALF_OPEN', openSince: this.openSince };
    return { name: 'CLOSED' };
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
