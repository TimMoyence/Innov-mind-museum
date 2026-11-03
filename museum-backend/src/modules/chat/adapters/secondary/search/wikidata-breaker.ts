import CircuitBreaker from 'opossum';

import type { WikidataClient } from './wikidata.client';
import type { BreakerState, BreakerStateName } from '@modules/chat/domain/breaker-state';
import type {
  ArtworkFacts,
  KnowledgeBaseProvider,
  KnowledgeBaseQuery,
} from '@modules/chat/domain/ports/knowledge-base.port';

export type { BreakerState, BreakerStateName };

export interface WikidataBreakerConfig {
  timeoutMs: number;
  errorThresholdPercentage: number;
  resetTimeoutMs: number;
  volumeThreshold: number;
  capacity: number;
}

type LookupFn = (query: KnowledgeBaseQuery) => Promise<ArtworkFacts | null>;

export class WikidataBreakerClient implements KnowledgeBaseProvider {
  private readonly breaker: CircuitBreaker<[KnowledgeBaseQuery], ArtworkFacts | null>;
  private openSince?: number;
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
      group: 'knowledge-base',
    });

    this.breaker.fallback(() => null);

    this.breaker.on('open', () => {
      this.openSince = Date.now();
    });
    this.breaker.on('close', () => {
      this.openSince = undefined;
    });
  }

  async lookup(query: KnowledgeBaseQuery): Promise<ArtworkFacts | null> {
    const result = await this.breaker.fire(query);
    return result ?? null;
  }

  getState(): BreakerState {
    if (this.breaker.opened) return { name: 'OPEN', openSince: this.openSince };
    if (this.breaker.halfOpen) return { name: 'HALF_OPEN', openSince: this.openSince };
    return { name: 'CLOSED' };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.breaker.shutdown();
  }
}
