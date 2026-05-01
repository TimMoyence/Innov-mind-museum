import { createHash } from 'node:crypto';

import { logger } from '@shared/logger/logger';
import { llmCacheHitsTotal, llmCacheMissesTotal } from '@shared/observability/prometheus-metrics';

import type {
  LlmCacheKeyInput,
  LlmCacheLookupResult,
  LlmCacheService,
  LlmContextClass,
} from './llm-cache.types';
import type { CacheService } from '@shared/cache/cache.port';

const KEY_VERSION = 'v1';
const KEY_PREFIX = 'llm';

/** TTL per context class (seconds). Constants per spec section 3.3. */
const TTL_GENERIC_S = 7 * 24 * 60 * 60; // 7 days
const TTL_MUSEUM_MODE_S = 24 * 60 * 60; // 1 day
const TTL_PERSONALIZED_S = 60 * 60; // 1 hour

/**
 * Adaptive LLM response cache. Exact-match key derivation; semantic
 * similarity matching is deferred to G Phase 2.
 *
 * Spec: docs/superpowers/specs/2026-05-01-G-llm-cache-design.md
 */
export class LlmCacheServiceImpl implements LlmCacheService {
  constructor(private readonly cache: CacheService) {}

  /** Classifies the input into a ContextClass for adaptive TTL. */
  classify(input: LlmCacheKeyInput): LlmContextClass {
    if (input.userPreferencesHash) {
      return 'personalized';
    }
    if (input.museumContext?.museumId !== undefined && input.museumContext.museumId !== null) {
      return 'museum-mode';
    }
    return 'generic';
  }

  /** Looks up a cached LLM response. Returns hit=false on miss. */
  async lookup<T>(input: LlmCacheKeyInput): Promise<LlmCacheLookupResult<T>> {
    const contextClass = this.classify(input);
    const key = this.buildKey(input, contextClass);
    const value = await this.cache.get<T>(key);
    if (value !== null) {
      llmCacheHitsTotal.inc({ context_class: contextClass });
    } else {
      llmCacheMissesTotal.inc({ context_class: contextClass });
    }
    return { hit: value !== null, value, contextClass };
  }

  /** Stores an LLM response under the derived key with the TTL for its context class. */
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- generic interface API where T constrains the stored value shape
  async store<T>(input: LlmCacheKeyInput, value: T): Promise<void> {
    const contextClass = this.classify(input);
    const key = this.buildKey(input, contextClass);
    const ttl = this.ttlFor(contextClass);
    await this.cache.set(key, value, ttl);
  }

  /** Drops all museum-scoped entries (museum-mode + personalized). Called from museum admin update. */
  async invalidateMuseum(museumId: number): Promise<void> {
    // Key shape for museum-scoped entries:
    //   llm:v1:{contextClass}:{museumId}:{userId|anon}:{hash}
    // (museumId sits BEFORE userId so delByPrefix can target a specific museum
    // without scanning all user namespaces.)
    const contextClasses: LlmContextClass[] = ['museum-mode', 'personalized'];
    for (const ctxClass of contextClasses) {
      const prefix = `${KEY_PREFIX}:${KEY_VERSION}:${ctxClass}:${String(museumId)}:`;
      try {
        await this.cache.delByPrefix(prefix);
        logger.info('llm_cache_invalidate_museum', { museumId, prefix, contextClass: ctxClass });
      } catch (err) {
        logger.warn('llm_cache_invalidate_museum_failed', {
          museumId,
          prefix,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  /** TTL (seconds) for a given context class. */
  private ttlFor(contextClass: LlmContextClass): number {
    if (contextClass === 'generic') return TTL_GENERIC_S;
    if (contextClass === 'museum-mode') return TTL_MUSEUM_MODE_S;
    return TTL_PERSONALIZED_S;
  }

  /**
   * Builds the deterministic cache key per spec section 3.2.
   *
   * Key shape: `llm:v1:{contextClass}:{museumId|none}:{userId|anon}:{sha256}`
   *
   * museumId is placed before userId so that `delByPrefix` can target all entries
   * for a specific museum across all users (invalidateMuseum). The spec's conceptual
   * shape places userId first, but the storage shape inverts them to enable the
   * prefix-based invalidation pattern.
   */
  private buildKey(input: LlmCacheKeyInput, contextClass: LlmContextClass): string {
    const userIdSeg = input.userId === 'anon' ? 'anon' : String(input.userId);
    const museumIdSeg = input.museumContext?.museumId ?? 'none';
    const hash = sha256OfCanonicalInput(input);
    return `${KEY_PREFIX}:${KEY_VERSION}:${contextClass}:${String(museumIdSeg)}:${userIdSeg}:${hash}`;
  }
}

/** Canonical SHA-256 over the cache-relevant fields of the input. Order-stable. */
function sha256OfCanonicalInput(input: LlmCacheKeyInput): string {
  const canonical = {
    model: input.model,
    systemSection: input.systemSection,
    locale: input.locale,
    museumName: input.museumContext?.museumName ?? null,
    userPreferencesHash: input.userPreferencesHash ?? null,
    prompt: input.prompt,
  };
  // Sort keys for deterministic JSON. localeCompare for stable ordering.
  const sortedJson = JSON.stringify(
    canonical,
    Object.keys(canonical).sort((a, b) => a.localeCompare(b)),
  );
  return createHash('sha256').update(sortedJson).digest('hex').slice(0, 32);
}
