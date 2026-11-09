import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';

import type {
  ArtworkFacts,
  KnowledgeBaseQuery,
} from '@modules/chat/domain/ports/knowledge-base.port';
import type { CacheService } from '@shared/cache/cache.port';

const DEFAULT_CONCURRENCY = 5;
const DEFAULT_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
const CACHE_KEY_PREFIX = 'wikidata:enrich:v1';

export interface WikidataLookupClient {
  lookup(query: KnowledgeBaseQuery): Promise<ArtworkFacts | null>;
}

export interface WikidataEnricherDeps {
  client: WikidataLookupClient;
  cache: CacheService;
  concurrency?: number;
  cacheTtlSeconds?: number;
}

function cacheKey(lang: string, qid: string): string {
  return `${CACHE_KEY_PREFIX}:${lang}:${qid}`;
}

async function runWithLimit<T>(limit: number, tasks: (() => Promise<T>)[]): Promise<T[]> {
  const cap = Math.max(1, limit);
  const results: T[] = new Array<T>(tasks.length);
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < tasks.length) {
      const i = cursor;
      cursor += 1;
      const task = tasks[i];
      results[i] = await task();
    }
  };

  const workerCount = Math.min(cap, tasks.length);
  const workers: Promise<void>[] = [];
  for (let i = 0; i < workerCount; i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

export class WikidataEnricher {
  private readonly client: WikidataLookupClient;
  private readonly cache: CacheService;
  private readonly concurrency: number;
  private readonly cacheTtlSeconds: number;

  constructor(deps: WikidataEnricherDeps) {
    this.client = deps.client;
    this.cache = deps.cache;
    this.concurrency = deps.concurrency ?? DEFAULT_CONCURRENCY;
    this.cacheTtlSeconds = deps.cacheTtlSeconds ?? DEFAULT_CACHE_TTL_SECONDS;
  }

  async enrichBatch(qids: string[], lang: string): Promise<Map<string, ArtworkFacts>> {
    const result = new Map<string, ArtworkFacts>();
    const uniqueQids = Array.from(new Set(qids));
    if (uniqueQids.length === 0) return result;

    const tasks = uniqueQids.map((qid) => async (): Promise<void> => {
      const key = cacheKey(lang, qid);

      let cached: ArtworkFacts | null = null;
      try {
        cached = await this.cache.get<ArtworkFacts>(key);
      } catch (err) {
        logger.warn('wikidata_enricher_cache_get_error', {
          qid,
          error: errorMessage(err),
        });
      }
      if (cached !== null) {
        result.set(qid, cached);
        return;
      }

      let facts: ArtworkFacts | null = null;
      try {
        facts = await this.client.lookup({ searchTerm: qid, language: lang });
      } catch (err) {
        logger.warn('wikidata_enricher_lookup_error', {
          qid,
          error: errorMessage(err),
        });
        return;
      }
      if (facts === null) return;

      result.set(qid, facts);

      try {
        await this.cache.set(key, facts, this.cacheTtlSeconds);
      } catch (err) {
        logger.warn('wikidata_enricher_cache_set_error', {
          qid,
          error: errorMessage(err),
        });
      }
    });

    await runWithLimit(this.concurrency, tasks);
    return result;
  }
}
