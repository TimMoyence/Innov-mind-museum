/**
 * LLM-cache key-input builder — extracted from `chat-message.service.ts`
 * (max-lines cap). Pure: maps the prepared pipeline state to the canonical
 * `LlmCacheKeyInput`. No I/O, no side effects.
 */
import { createHash } from 'node:crypto';

import { env } from '@src/config/env';

import type { PostMessageInput } from '@modules/chat/domain/chat.types';
import type { LlmCacheKeyInput } from '@modules/chat/useCase/llm/llm-cache.types';
import type { PrepareReady } from '@modules/chat/useCase/orchestration/prepare-message.pipeline';

/** 16-char hex SHA-256 digest of a string — stable `userPreferencesHash`. */
function hashString16(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

/**
 * Builds the `LlmCacheKeyInput` from the prepared pipeline state. Returns null
 * when the prompt is empty (image-only, no cacheable text).
 */
export function buildLlmCacheInput(
  prep: PrepareReady,
  sanitizedText: string,
  input: PostMessageInput,
): LlmCacheKeyInput | null {
  if (!sanitizedText) return null;
  return {
    model: env.llm.model,
    userId: prep.ownerId ?? 'anon',
    systemSection: 'chat-default',
    locale: prep.requestedLocale ?? 'en',
    museumContext: {
      museumId: prep.session.museumId ?? null,
      museumName: prep.session.museumName ?? null,
    },
    userPreferencesHash: prep.userMemoryBlock ? hashString16(prep.userMemoryBlock) : undefined,
    prompt: sanitizedText,
    // C3 (R6/R8) — include the visual signature ONLY when available. When
    // absent (text-only, url-source), canonical input is byte-identical to
    // the pre-C3 shape (legacy keys preserved — see R8 / AC6).
    imageContentHash: prep.imageContentHash,
    // F1 (2026-05-19) — propagate voiceMode / audioDescriptionMode so the
    // cache key discriminates (voice / no-voice) and (audio-desc / no-audio-desc)
    // cohorts. C9.10 voice prompt branch produces 60-80w prose ; absent here
    // → keys collide → wrong-shape responses cross-served.
    voiceMode: input.context?.voiceMode,
    audioDescriptionMode: input.context?.audioDescriptionMode,
    // I-FIX2 (2026-05-21) — `[CURRENT ARTWORK]` is rendered in the system
    // prompt (`llm-prompt-builder.ts:74`) but was historically NOT folded
    // into the cache key — two visitors in the same museum asking the same
    // prompt about different artworks would share the cache line. Prefer
    // the stable UUID `session.currentArtworkId` (set when the visitor
    // scans an artwork) ; fallback to the already-sanitised title from the
    // resolved `currentArtwork` block (lookup may return a row even when
    // session.currentArtworkId is not echoed back through prep). Truthy-only
    // contract enforced downstream in `sha256OfCanonicalInput` — undefined
    // / empty produces a byte-identical legacy hash.
    currentArtworkKey: prep.session.currentArtworkId ?? prep.currentArtwork?.title ?? undefined,
  };
}
