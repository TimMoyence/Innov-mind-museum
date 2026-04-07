import { logger } from '@shared/logger/logger';

import { buildCacheKey, normalizeQuestion } from '../../useCase/chat-cache-key.util';

import type { ChatAssistantMetadata } from '../../domain/chat.types';
import type {
  ChatOrchestrator,
  OrchestratorInput,
  OrchestratorOutput,
} from '../../domain/ports/chat-orchestrator.port';
import type { PiiSanitizer } from '../../domain/ports/pii-sanitizer.port';
import type { CacheService } from '@shared/cache/cache.port';

/** Shape stored in cache — includes originalText for collision detection. */
interface CachedOrchestratorOutput {
  originalText: string;
  locale: string;
  text: string;
  metadata: ChatAssistantMetadata;
}

/** Dependencies injected into the caching decorator. */
export interface CachingChatOrchestratorDeps {
  delegate: ChatOrchestrator;
  cache: CacheService;
  ttlSeconds: number;
  popularityZsetTtlSeconds: number;
  piiSanitizer: PiiSanitizer;
}

const MAX_TEXT_LENGTH = 500;
const REPLAY_CHUNK_SIZE = 8;
const REPLAY_CHUNK_DELAY_MS = 25;

/**
 * Decorator that wraps a {@link ChatOrchestrator} with a Redis cache layer.
 *
 * Implements the same port, so it is transparent to callers.
 * All cache operations are fail-open: errors are logged but never propagated.
 */
export class CachingChatOrchestrator implements ChatOrchestrator {
  private readonly delegate: ChatOrchestrator;
  private readonly cache: CacheService;
  private readonly ttlSeconds: number;
  private readonly piiSanitizer: PiiSanitizer;

  constructor(deps: CachingChatOrchestratorDeps) {
    this.delegate = deps.delegate;
    this.cache = deps.cache;
    this.ttlSeconds = deps.ttlSeconds;
    this.piiSanitizer = deps.piiSanitizer;
  }

  /** Generates a response, checking the cache first when eligible. */
  async generate(input: OrchestratorInput): Promise<OrchestratorOutput> {
    if (!this.shouldCache(input)) {
      return await this.delegate.generate(input);
    }

    const key = this.computeKey(input);
    const normalizedText = normalizeQuestion(input.text);

    // Try cache lookup (fail-open)
    let cached: CachedOrchestratorOutput | null = null;
    try {
      cached = await this.cache.get<CachedOrchestratorOutput>(key);
    } catch (error) {
      logger.warn('llm_cache_get_error', {
        error: (error as Error).message,
        requestId: input.requestId,
      });
    }

    // Cache hit with collision check
    if (cached?.originalText === normalizedText) {
      logger.info('llm_cache_hit', { key, requestId: input.requestId });
      await this.bumpPopularity(input, key);
      return { text: cached.text, metadata: cached.metadata };
    }

    // Cache miss — delegate
    const result = await this.delegate.generate(input);
    await this.storeAndBump(input, key, normalizedText, result);
    return result;
  }

  /** Generates a streaming response, replaying from cache when available. */
  async generateStream(
    input: OrchestratorInput,
    onChunk: (text: string) => void,
  ): Promise<OrchestratorOutput> {
    if (!this.shouldCache(input)) {
      return await this.delegate.generateStream(input, onChunk);
    }

    const key = this.computeKey(input);
    const normalizedText = normalizeQuestion(input.text);

    // Try cache lookup (fail-open)
    let cached: CachedOrchestratorOutput | null = null;
    try {
      cached = await this.cache.get<CachedOrchestratorOutput>(key);
    } catch (error) {
      logger.warn('llm_cache_stream_get_error', {
        error: (error as Error).message,
        requestId: input.requestId,
      });
    }

    // Cache hit — replay as chunks
    if (cached?.originalText === normalizedText) {
      logger.info('llm_cache_stream_hit', { key, requestId: input.requestId });
      await this.bumpPopularity(input, key);
      await this.replayCachedAsStream(cached.text, onChunk);
      return { text: cached.text, metadata: cached.metadata };
    }

    // Cache miss — delegate streaming, accumulate, then cache
    const result = await this.delegate.generateStream(input, onChunk);
    await this.storeAndBump(input, key, normalizedText, result);
    return result;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Returns true only when ALL caching preconditions are met.
   * When true, `input.text` is guaranteed to be a non-empty string
   * and `extractMuseumId(input)` is guaranteed to return a valid ID.
   */
  private shouldCache(input: OrchestratorInput): input is OrchestratorInput & { text: string } {
    if (!input.museumMode) return false;
    if (input.image) return false;
    if (input.history.length > 0) return false;
    if (!input.text || input.text.length > MAX_TEXT_LENGTH) return false;
    if (input.userMemoryBlock) return false;
    if (this.piiSanitizer.sanitize(input.text).detectedPiiCount > 0) return false;
    if (!this.extractMuseumId(input)) return false;
    return true;
  }

  /** Builds a deterministic cache key from the input (caller must ensure text is present). */
  private computeKey(input: OrchestratorInput & { text: string }): string {
    return buildCacheKey({
      text: input.text,
      museumId: String(this.extractMuseumId(input)),
      locale: input.locale ?? 'en',
      guideLevel: input.context?.guideLevel ?? 'beginner',
      audioDescriptionMode: input.audioDescriptionMode ?? false,
    });
  }

  /** Extracts museumId from the input. Returns null if not available. */
  private extractMuseumId(input: OrchestratorInput): number | null {
    return input.museumId ?? null;
  }

  /** Stores the result in cache and bumps popularity. Fail-open on errors. */
  private async storeAndBump(
    input: OrchestratorInput,
    key: string,
    normalizedText: string,
    result: OrchestratorOutput,
  ): Promise<void> {
    const entry: CachedOrchestratorOutput = {
      originalText: normalizedText,
      locale: input.locale ?? 'en',
      text: result.text,
      metadata: result.metadata,
    };

    try {
      await this.cache.set(key, entry, this.ttlSeconds);
    } catch (error) {
      logger.warn('llm_cache_set_error', {
        error: (error as Error).message,
        requestId: input.requestId,
      });
    }

    await this.bumpPopularity(input, key);
  }

  /** Increments the popularity sorted set for this museum. Fail-open. */
  private async bumpPopularity(input: OrchestratorInput, key: string): Promise<void> {
    const museumId = this.extractMuseumId(input);
    if (!museumId) return;

    try {
      await this.cache.zadd(`chat:llm:popular:${museumId}`, key, 1);
    } catch (error) {
      logger.warn('llm_cache_popularity_error', {
        error: (error as Error).message,
        requestId: input.requestId,
      });
    }
  }

  /** Replays cached text as chunked stream output with a small delay between chunks. */
  private async replayCachedAsStream(text: string, onChunk: (text: string) => void): Promise<void> {
    for (let i = 0; i < text.length; i += REPLAY_CHUNK_SIZE) {
      const chunk = text.slice(i, i + REPLAY_CHUNK_SIZE);
      onChunk(chunk);
      if (i + REPLAY_CHUNK_SIZE < text.length) {
        await this.delay(REPLAY_CHUNK_DELAY_MS);
      }
    }
  }

  /** Creates a promise that resolves after the given milliseconds. */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
