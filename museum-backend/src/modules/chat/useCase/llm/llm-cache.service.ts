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

const KEY_VERSION = 'v2';
const KEY_PREFIX = 'llm';

const TTL_GENERIC_S = 7 * 24 * 60 * 60;
const TTL_MUSEUM_MODE_S = 24 * 60 * 60;
const TTL_PERSONALIZED_S = 60 * 60;

/** Exact-match key derivation; semantic similarity deferred to G Phase 2. */
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

  /**
   * PR-P0-1 (2026-05-23) — Public alias of the internal key derivation. Lets
   * callers (notably `ChatMessageService.tryLlmCacheStore`) stamp the exact
   * byte-string key on the assistant `ChatMessage` row at write time, so
   * `ChatMediaService.invalidateCacheForFeedback` can later purge the EXACT
   * entry on negative feedback — no reconstruction, no cartesian, no
   * over-purge. Pure (no I/O), deterministic per input.
   *
   * Intended for persistence stamping ONLY — do NOT use to drive lookup/store
   * (call those directly so TTL classification + metrics + fail-open stay on
   * a single code path).
   */
  computeKey(input: LlmCacheKeyInput): string {
    return this.buildKey(input, this.classify(input));
  }

  /** Fail-open (ADR-036/R8): cache-layer exception → hit=false. */
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
        error: err instanceof Error ? err.message : String(err),
      });
      llmCacheMissesTotal.inc({ context_class: contextClass });
      return { hit: false, value: null, contextClass };
    }
    if (value !== null) {
      llmCacheHitsTotal.inc({ context_class: contextClass });
    } else {
      llmCacheMissesTotal.inc({ context_class: contextClass });
    }
    return { hit: value !== null, value, contextClass };
  }

  /** Fail-open (ADR-036/R8). */
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- generic interface API where T constrains the stored value shape
  async store<T>(input: LlmCacheKeyInput, value: T): Promise<void> {
    const contextClass = this.classify(input);
    const key = this.buildKey(input, contextClass);
    const ttl = this.ttlFor(contextClass);
    try {
      await this.cache.set(key, value, ttl);
    } catch (err) {
      logger.warn('llm_cache_store_failed', {
        layer: 'l1',
        contextClass,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** Drops museum-mode + personalized entries; called from museum admin update. */
  async invalidateMuseum(museumId: number): Promise<void> {
    // museumId BEFORE userId in key so delByPrefix can target a museum
    // across all user namespaces.
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

  private ttlFor(contextClass: LlmContextClass): number {
    if (contextClass === 'generic') return TTL_GENERIC_S;
    if (contextClass === 'museum-mode') return TTL_MUSEUM_MODE_S;
    return TTL_PERSONALIZED_S;
  }

  /**
   * Key: `llm:v2:{contextClass}:{museumId|none}:{userId|anon}:{sha256}`.
   * museumId BEFORE userId for `delByPrefix` invalidateMuseum pattern (inverts
   * spec's conceptual order). F1 (2026-05-19) — canonical input now folds in
   * `voiceMode` + `audioDescriptionMode` (truthy-only, mirror imageContentHash
   * R8/AC6 contract) so the (voice / no-voice) and (audio-desc / no-audio-desc)
   * cohorts get distinct scopes ; legacy entries are isolated by the v1→v2 bump.
   */
  private buildKey(input: LlmCacheKeyInput, contextClass: LlmContextClass): string {
    const userIdSeg = input.userId === 'anon' ? 'anon' : String(input.userId);
    const museumIdSeg = input.museumContext?.museumId ?? 'none';
    const hash = sha256OfCanonicalInput(input);
    return `${KEY_PREFIX}:${KEY_VERSION}:${contextClass}:${String(museumIdSeg)}:${userIdSeg}:${hash}`;
  }
}

function sha256OfCanonicalInput(input: LlmCacheKeyInput): string {
  // R8/AC6 — imageContentHash only when present so legacy text-only entries
  // produce the SAME canonical JSON (post-C3 backward-compat with pre-C3 entries).
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
  // F1 (2026-05-19) — truthy-only emit so legacy text-only entries WITHOUT
  // voiceMode/audioDescriptionMode produce byte-identical canonical JSON
  // (mirror R8/AC6 imageContentHash contract). v1→v2 KEY_VERSION bump isolates
  // pre-F1 entries.
  if (input.audioDescriptionMode) {
    canonical.audioDescriptionMode = input.audioDescriptionMode;
  }
  if (input.voiceMode) {
    canonical.voiceMode = input.voiceMode;
  }
  // I-FIX2 (2026-05-21) — truthy-only emit (mirror imageContentHash R8/AC6 +
  // voiceMode F1). Identity of the current artwork already rendered in the
  // system prompt MUST partition the cache so 2 visitors in the same museum
  // looking at different artworks don't share a cache line. Absent / empty →
  // field excluded from canonical JSON → byte-identical to pre-I-FIX2 entries
  // (no KEY_VERSION bump needed).
  if (input.currentArtworkKey) {
    canonical.currentArtworkKey = input.currentArtworkKey;
  }
  // Sort keys for deterministic JSON (localeCompare = stable).
  const sortedJson = JSON.stringify(
    canonical,
    Object.keys(canonical).sort((a, b) => a.localeCompare(b)),
  );
  return createHash('sha256').update(sortedJson).digest('hex').slice(0, 32);
}
