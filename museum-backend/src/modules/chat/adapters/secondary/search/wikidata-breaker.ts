import CircuitBreaker from 'opossum';

import type { WikidataClient } from './wikidata.client';
import type {
  ArtworkFacts,
  KnowledgeBaseProvider,
  KnowledgeBaseQuery,
} from '@modules/chat/domain/ports/knowledge-base.port';

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

/** Symbolic name of the breaker's current state, mapped from opossum flags. */
export type BreakerStateName = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/** Snapshot consumed by the C5 cascade (Step 5.1) to decide local-dump fallback. */
export interface BreakerState {
  name: BreakerStateName;
  /** Timestamp (ms epoch) of the most recent OPEN transition ; carried through HALF_OPEN. */
  openSince?: number;
}

type LookupFn = (query: KnowledgeBaseQuery) => Promise<ArtworkFacts | null>;

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
 */
export class WikidataBreakerClient implements KnowledgeBaseProvider {
  private readonly breaker: CircuitBreaker<[KnowledgeBaseQuery], ArtworkFacts | null>;
  private openSince?: number;

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

    this.breaker.on('open', () => {
      this.openSince = Date.now();
    });
    this.breaker.on('halfOpen', () => {
      // openSince retained — cascade soak window still references the original open timestamp.
    });
    this.breaker.on('close', () => {
      this.openSince = undefined;
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
}
