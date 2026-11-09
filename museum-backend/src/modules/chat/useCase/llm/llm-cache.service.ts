import { createHash } from 'node:crypto';

import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';

import type {
  LlmCacheKeyInput,
  LlmCacheLookupResult,
  LlmCacheService,
  LlmContextClass,
} from './llm-cache.types';
import type { CacheService } from '@shared/cache/cache.port';

const KEY_VERSION = 'v4';
const KEY_PREFIX = 'llm';

const TTL_GENERIC_S = 7 * 24 * 60 * 60;
const TTL_MUSEUM_MODE_S = 24 * 60 * 60;
const TTL_PERSONALIZED_S = 60 * 60;

export class LlmCacheServiceImpl implements LlmCacheService {
  constructor(private readonly cache: CacheService) {}

  classify(input: LlmCacheKeyInput): LlmContextClass {
    if (input.userPreferencesHash) {
      return 'personalized';
    }
    if (input.museumContext?.museumId !== undefined && input.museumContext.museumId !== null) {
      return 'museum-mode';
    }
    return 'generic';
  }

  computeKey(input: LlmCacheKeyInput): string {
    return this.buildKey(input, this.classify(input));
  }

  async lookup<T>(input: LlmCacheKeyInput): Promise<LlmCacheLookupResult<T>> {
    const contextClass = this.classify(input);
    const key = this.buildKey(input, contextClass);
    let value: T | null;
    try {
      value = await this.cache.get<T>(key);
    } catch (err) {
      logger.warn('llm_cache_lookup_failed', {
        layer: 'l1',
        contextClass,
        error: errorMessage(err),
      });
      return { hit: false, value: null, contextClass };
    }
    return { hit: value !== null, value, contextClass };
  }

  async store(input: LlmCacheKeyInput, value: unknown): Promise<void> {
    const contextClass = this.classify(input);
    const key = this.buildKey(input, contextClass);
    const ttl = this.ttlFor(contextClass);
    try {
      await this.cache.set(key, value, ttl);
    } catch (err) {
      logger.warn('llm_cache_store_failed', {
        layer: 'l1',
        contextClass,
        error: errorMessage(err),
      });
    }
  }

  async invalidateMuseum(museumId: number): Promise<void> {
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
          error: errorMessage(err),
        });
      }
    }
  }

  private ttlFor(contextClass: LlmContextClass): number {
    if (contextClass === 'generic') return TTL_GENERIC_S;
    if (contextClass === 'museum-mode') return TTL_MUSEUM_MODE_S;
    return TTL_PERSONALIZED_S;
  }

  private buildKey(input: LlmCacheKeyInput, contextClass: LlmContextClass): string {
    const userIdSeg = input.userId === 'anon' ? 'anon' : String(input.userId);
    const museumIdSeg = input.museumContext?.museumId ?? 'none';
    const hash = sha256OfCanonicalInput(input);
    return `${KEY_PREFIX}:${KEY_VERSION}:${contextClass}:${String(museumIdSeg)}:${userIdSeg}:${hash}`;
  }
}

function sha256OfCanonicalInput(input: LlmCacheKeyInput): string {
  const canonical: Record<string, unknown> = {
    model: input.model,
    systemSection: input.systemSection,
    locale: input.locale,
    museumName: input.museumContext?.museumName ?? null,
    userPreferencesHash: input.userPreferencesHash ?? null,
    prompt: input.prompt,
  };
  if (input.imageContentHash !== undefined) {
    canonical.imageContentHash = input.imageContentHash;
  }
  if (input.audioDescriptionMode) {
    canonical.audioDescriptionMode = input.audioDescriptionMode;
  }
  if (input.voiceMode) {
    canonical.voiceMode = input.voiceMode;
  }
  if (input.currentArtworkKey) {
    canonical.currentArtworkKey = input.currentArtworkKey;
  }
  if (input.lowDataMode) {
    canonical.lowDataMode = true;
  }
  const sortedJson = JSON.stringify(
    canonical,
    Object.keys(canonical).sort((a, b) => a.localeCompare(b)),
  );
  return createHash('sha256').update(sortedJson).digest('hex').slice(0, 32);
}
