import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';

import { buildKnowledgeBasePromptBlock } from './knowledge-base.prompt';

import type { BreakerState } from '@modules/chat/domain/breaker-state';
import type {
  ArtworkFacts,
  KnowledgeBaseProvider,
  KnowledgeBaseServiceConfig,
} from '@modules/chat/domain/ports/knowledge-base.port';
import type { WikidataKbDumpRepositoryPort } from '@modules/chat/domain/ports/wikidata-kb-dump.port';
import type { CacheService } from '@shared/cache/cache.port';

interface CacheEntry {
  facts: ArtworkFacts | null;
}

export interface KnowledgeBaseCascadeDeps {
  breakerState: () => BreakerState;
  dumpRepo: WikidataKbDumpRepositoryPort;
}

export class KnowledgeBaseService {
  constructor(
    private readonly provider: KnowledgeBaseProvider,
    private readonly config: KnowledgeBaseServiceConfig,
    private readonly cacheService?: CacheService,
    private readonly cascade?: KnowledgeBaseCascadeDeps,
  ) {}

  async lookupFacts(searchTerm: string, language?: string): Promise<ArtworkFacts | null> {
    const key = searchTerm.toLowerCase().trim();
    if (!key) return null;

    const cacheKey = `kb:wikidata:${key}`;

    const cacheHit = await this.tryCacheHit(cacheKey, key);
    if (cacheHit !== undefined) {
      return cacheHit.facts;
    }

    try {
      const { facts, source, answered } = await this.fetchAndCascade(key, language);
      if (answered) await this.writeCache(cacheKey, facts);
      logger.info('kb_lookup_success', { searchTerm: key, found: facts !== null, source });
      return facts;
    } catch (err) {
      this.logFetchError(key, err);
      return null;
    }
  }

  private async tryCacheHit(cacheKey: string, key: string): Promise<CacheEntry | undefined> {
    if (!this.cacheService) return undefined;
    try {
      const cached = await this.cacheService.get<CacheEntry>(cacheKey);
      if (cached) {
        logger.info('kb_cache_hit', { searchTerm: key });
        return cached;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  private async fetchAndCascade(
    key: string,
    language: string | undefined,
  ): Promise<{ facts: ArtworkFacts | null; source: 'live' | 'dump'; answered: boolean }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.config.timeoutMs);

    let facts: ArtworkFacts | null;
    try {
      facts = await Promise.race<ArtworkFacts | null>([
        this.provider.lookup({ searchTerm: key, language }),
        new Promise<null>((_, reject) => {
          controller.signal.addEventListener('abort', () => {
            reject(new Error('KB_TIMEOUT'));
          });
        }),
      ]);
    } catch (err) {
      this.logFetchError(key, err);
      return { ...(await this.applyCascade(key, language)), answered: false };
    } finally {
      clearTimeout(timeout);
    }

    if (facts !== null) return { facts, source: 'live', answered: true };
    return { ...(await this.applyCascade(key, language)), answered: true };
  }

  private async applyCascade(
    key: string,
    language: string | undefined,
  ): Promise<{ facts: ArtworkFacts | null; source: 'live' | 'dump' }> {
    const cascadeDeps = this.cascade;
    if (!cascadeDeps || !this.shouldFallbackToDump()) {
      return { facts: null, source: 'live' };
    }
    const dumpFacts = await cascadeDeps.dumpRepo.findFactsBySearchTerm(key, language);
    if (dumpFacts) {
      return { facts: dumpFacts, source: 'dump' };
    }
    return { facts: null, source: 'live' };
  }

  private async writeCache(cacheKey: string, facts: ArtworkFacts | null): Promise<void> {
    if (!this.cacheService) return;
    try {
      await this.cacheService.set(cacheKey, { facts }, this.config.cacheTtlSeconds);
    } catch {}
  }

  private logFetchError(key: string, err: unknown): void {
    const message = errorMessage(err);
    if (message === 'KB_TIMEOUT') {
      logger.warn('kb_lookup_timeout', { searchTerm: key, timeoutMs: this.config.timeoutMs });
    } else {
      logger.warn('kb_lookup_error', { searchTerm: key, error: message });
    }
  }

  private shouldFallbackToDump(): boolean {
    if (!this.cascade) return false;
    const state = this.cascade.breakerState();
    if (state.name !== 'OPEN') return false;
    const soak = this.config.localDumpFallbackAfterMs ?? 0;
    if (soak === 0) return true;
    if (state.openSince === undefined) return false;
    return Date.now() - state.openSince >= soak;
  }

  async lookup(searchTerm: string, language?: string): Promise<string> {
    const facts = await this.lookupFacts(searchTerm, language);
    return buildKnowledgeBasePromptBlock(facts);
  }
}
