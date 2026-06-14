/**
 * T4.6 — Visual-similarity Wikidata batch enricher.
 *
 * Wraps {@link WikidataClient.lookup} with three batch-friendly behaviours
 * that the per-call client doesn't provide on its own:
 *
 *   1. **Dedup** — collapses duplicate QIDs in the input list to a single
 *      lookup (one fetch per unique entity, not per occurrence).
 *   2. **Concurrency cap** — bounds the number of in-flight HTTPS lookups
 *      at {@link DEFAULT_CONCURRENCY} (= 5). Wikidata throttles aggressive
 *      callers, so this is also our outbound politeness gate.
 *   3. **Cache-aside** — short-circuits cache hits and persists fresh
 *      lookups under a versioned key with a 7-day TTL.
 *
 * The C2-zone {@link WikidataClient} is read-only for this phase; we depend
 * on its public `lookup` shape only. A tiny inline semaphore is used in
 * lieu of pulling in `p-limit` — see {@link runWithLimit}.
 */
import { logger } from '@shared/logger/logger';

import type {
  ArtworkFacts,
  KnowledgeBaseQuery,
} from '@modules/chat/domain/ports/knowledge-base.port';
import type { CacheService } from '@shared/cache/cache.port';

/** Default in-flight cap for outbound Wikidata lookups (per `enrichBatch` call). */
const DEFAULT_CONCURRENCY = 5;
/** Default cache TTL — 7 days. Wikidata facts are slow-moving; weekly refresh is plenty. */
const DEFAULT_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
/** Cache key namespace. Bump the version segment on payload-shape changes. */
const CACHE_KEY_PREFIX = 'wikidata:enrich:v1';

/** Minimal client shape needed by the enricher — keeps tests easy to mock. */
export interface WikidataLookupClient {
  lookup(query: KnowledgeBaseQuery): Promise<ArtworkFacts | null>;
}

/** Constructor dependencies for {@link WikidataEnricher}. */
export interface WikidataEnricherDeps {
  /** Wikidata adapter — `WikidataClient` in production, jest.fn in tests. */
  client: WikidataLookupClient;
  /** Cache backend (Redis in prod, in-memory in tests). */
  cache: CacheService;
  /** Override the default in-flight cap. Defaults to {@link DEFAULT_CONCURRENCY}. */
  concurrency?: number;
  /** Override the default 7-day TTL. Defaults to {@link DEFAULT_CACHE_TTL_SECONDS}. */
  cacheTtlSeconds?: number;
}

function cacheKey(lang: string, qid: string): string {
  return `${CACHE_KEY_PREFIX}:${lang}:${qid}`;
}

/**
 * Tiny semaphore-style executor. Runs `tasks` with at most `limit` in flight,
 * preserving the original order of returned results. Errors propagate via
 * `Promise.all`; we don't swallow rejections — `WikidataClient.lookup` is
 * already fail-soft (returns `null`), so propagation is a defensive ladder
 * for unexpected throw paths.
 *
 * @param limit - Max concurrent invocations. Coerced to >= 1.
 * @param tasks - Thunks returning a promise. Called lazily.
 * @returns Results in the same order as `tasks`.
 */
async function runWithLimit<T>(limit: number, tasks: (() => Promise<T>)[]): Promise<T[]> {
  const cap = Math.max(1, limit);
  const results: T[] = new Array<T>(tasks.length);
  let cursor = 0;

  /**
   * Worker loop — pulls the next pending index off `cursor` and runs the
   * matching task until the queue is drained.
   */
  const worker = async (): Promise<void> => {
    while (cursor < tasks.length) {
      const i = cursor;
      cursor += 1;
      // Bounded by the loop condition; non-null assertion preserves index typing
      // without a runtime guard the type system already rules out.
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

/**
 * Batch enricher around {@link WikidataLookupClient.lookup}.
 *
 * Resolves a list of QIDs to a `Map<qid, ArtworkFacts>` containing only the
 * QIDs that actually resolved — null/missing entries are dropped silently
 * (the caller decides what to do about gaps).
 */
export class WikidataEnricher {
  private readonly client: WikidataLookupClient;
  private readonly cache: CacheService;
  private readonly concurrency: number;
  private readonly cacheTtlSeconds: number;

  /** Cache is fail-soft (errors logged + swallowed); client is source of truth. */
  constructor(deps: WikidataEnricherDeps) {
    this.client = deps.client;
    this.cache = deps.cache;
    this.concurrency = deps.concurrency ?? DEFAULT_CONCURRENCY;
    this.cacheTtlSeconds = deps.cacheTtlSeconds ?? DEFAULT_CACHE_TTL_SECONDS;
  }

  /**
   * Resolve `qids` to facts via cache-aside + bounded-concurrency lookups.
   *
   * Behaviour contract (locked by T4.6 unit tests):
   *   - Duplicates in `qids` collapse to one lookup per unique entity.
   *   - At most `this.concurrency` lookups in flight concurrently.
   *   - Cache hits short-circuit `client.lookup`.
   *   - Misses are persisted with a 7-day TTL.
   *   - Null lookups (entity not found) are NOT placed in the result Map.
   *
   * @param qids - Raw input list of Wikidata entity IDs (may contain dupes).
   * @param lang - Language code passed through to `lookup` and cache key.
   * @returns Resolved facts keyed by QID. Missing entities are absent.
   */
  async enrichBatch(qids: string[], lang: string): Promise<Map<string, ArtworkFacts>> {
    const result = new Map<string, ArtworkFacts>();
    const uniqueQids = Array.from(new Set(qids));
    if (uniqueQids.length === 0) return result;

    const tasks = uniqueQids.map((qid) => async (): Promise<void> => {
      const key = cacheKey(lang, qid);

      // Cache-aside read — log + fall through on cache failure.
      let cached: ArtworkFacts | null = null;
      try {
        cached = await this.cache.get<ArtworkFacts>(key);
      } catch (err) {
        logger.warn('wikidata_enricher_cache_get_error', {
          qid,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      if (cached !== null) {
        result.set(qid, cached);
        return;
      }

      // Per-qid isolation: the lookup is *meant* to be fail-soft (return null),
      // but an underlying client can still throw (prod egress/DNS failure, SSRF
      // guard, parse error). Catch it here so one qid's failure becomes a gap in
      // the Map (same contract as null) instead of rejecting runWithLimit's
      // Promise.all → enrichBatch throw → /chat/compare 500. Enrichment is a
      // supplementary overlay; it must never crash the core visual-similarity
      // result. (Prod incident 2026-06-14: encoder fix exposed this latent throw
      // — every compare with neighbours 500'd once the model loaded.)
      let facts: ArtworkFacts | null = null;
      try {
        facts = await this.client.lookup({ searchTerm: qid, language: lang });
      } catch (err) {
        logger.warn('wikidata_enricher_lookup_error', {
          qid,
          error: err instanceof Error ? err.message : String(err),
        });
        return; // Drop on throw — gap in the result Map (same contract as null).
      }
      if (facts === null) return; // Drop nulls — gap in the result Map is the contract.

      result.set(qid, facts);

      // Cache-aside write — log + swallow on cache failure (fail-soft).
      try {
        await this.cache.set(key, facts, this.cacheTtlSeconds);
      } catch (err) {
        logger.warn('wikidata_enricher_cache_set_error', {
          qid,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    await runWithLimit(this.concurrency, tasks);
    return result;
  }
}
