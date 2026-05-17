/**
 * compareImageUseCase — POST /chat/compare orchestrator: imageProcessor →
 * similarity → optional persist.
 *
 * Failure semantics (locked by compare.use-case.test.ts):
 * - processor throws → propagate; no similarity call, no persist.
 * - similarity returns `fallbackReason: 'encoder_unavailable'` (R11) → return
 *   WITHOUT persisting (route maps to 503; no phantom assistant turn).
 * - any other fallbackReason (`no_visual_neighbor`, `quota_exceeded`) → persist
 *   assistant message so FE empty-result UX has a stable record (R10).
 *
 * Structural ports: composition root adapts production services. No direct
 * ChatService import (would couple to wider chat module surface).
 */

import { createHash } from 'node:crypto';

import { logger } from '@shared/logger/logger';

import type { CompareResult } from '@modules/chat/domain/visual-similarity/compare-result.types';

export type CompareMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface ImageProcessorPort {
  /**
   * R12 — re-uses shared chat image pipeline (EXIF/magic/MIME/OCR). MUST throw
   * on invalid magic, disallowed MIME, oversize-post-strip, or OCR injection.
   * May transcode MIME (e.g. HEIC → JPEG); callers must use returned `mimeType`.
   */
  process(input: {
    sessionId: string;
    buffer: Buffer;
    mimeType: CompareMimeType;
    ownerId?: number;
  }): Promise<{ buffer: Buffer; mimeType: CompareMimeType }>;
}

export interface SimilarityServicePort {
  compare(input: {
    buffer: Buffer;
    mimeType: CompareMimeType;
    topK: number;
    locale: 'fr' | 'en';
    museumQids?: string[];
    /** OWASP LLM08 internal tenant scope (`museums.id`). */
    museumId?: number | null;
  }): Promise<CompareResult>;
}

export interface ChatPersistencePort {
  appendAssistantMessage(input: {
    sessionId: string;
    text?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ id: string }>;
}

export interface CompareUseCaseDeps {
  imageProcessor: ImageProcessorPort;
  similarityService: SimilarityServicePort;
  chatService: ChatPersistencePort;
}

export interface CompareUseCaseInput {
  sessionId: string;
  /** Raw bytes BEFORE sanitisation. */
  buffer: Buffer;
  mimeType: CompareMimeType;
  topK: number;
  locale: 'fr' | 'en';
  /** R4 external public-axis filter forwarded to kNN. */
  museumQids?: string[];
  /**
   * OWASP LLM08 internal tenant scope (resolved by route from `ChatSession.museumId`).
   * V1 single-tenant ships undefined; repo layer logs warn.
   */
  museumId?: number | null;
  ownerId?: number;
}

/** Returned function holds no per-call state — safe to share across requests. */
export function compareImageUseCase(
  deps: CompareUseCaseDeps,
): (input: CompareUseCaseInput) => Promise<CompareResult> {
  const { imageProcessor, similarityService, chatService } = deps;

  return async function runCompare(input: CompareUseCaseInput): Promise<CompareResult> {
    const startedAt = Date.now();
    // Hash BEFORE processor so audit keys on user-submitted bytes (post-EXIF
    // would diverge on every re-upload of the same photo). Matches cache-key
    // hash function so operators can grep by same hex digest.
    const queryEmbeddingHash = createHash('sha256').update(input.buffer).digest('hex');

    // R12 — shared pipeline. Failure aborts; no assistant turn persisted.
    const processed = await imageProcessor.process({
      sessionId: input.sessionId,
      buffer: input.buffer,
      mimeType: input.mimeType,
      ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
    });

    // Forward processor mimeType 1:1 (may have transcoded e.g. HEIC→JPEG).
    const compareInput: Parameters<SimilarityServicePort['compare']>[0] = {
      buffer: processed.buffer,
      mimeType: processed.mimeType,
      topK: input.topK,
      locale: input.locale,
      ...(input.museumQids !== undefined ? { museumQids: input.museumQids } : {}),
      // OWASP LLM08 — null treated as undefined downstream (legacy global read
      // + warn); only a positive integer activates the WHERE clause.
      ...(input.museumId !== undefined && input.museumId !== null
        ? { museumId: input.museumId }
        : {}),
    };
    const result = await similarityService.compare(compareInput);

    // R11 — encoder outage maps to 503; no persist (avoid phantom audit turn).
    if (result.fallbackReason === 'encoder_unavailable') {
      logger.info('compare_request', {
        sessionId: input.sessionId,
        userId: input.ownerId ?? null,
        queryEmbeddingHash,
        topK: input.topK,
        locale: input.locale,
        durationMs: Date.now() - startedAt,
        fallbackReason: 'encoder_unavailable',
      });
      return result;
    }

    // R10/Q7 — persist even on empty matches so FE empty-result UX has stable
    // record. `metadata.fallbackReason` mirrors top-level for flat consumers.
    const metadata: Record<string, unknown> = {
      compareResults: result,
    };
    if (result.fallbackReason !== undefined) {
      metadata.fallbackReason = result.fallbackReason;
    }
    await chatService.appendAssistantMessage({
      sessionId: input.sessionId,
      metadata,
    });

    // R14 audit AFTER persistence so message id is on row when operator greps.
    logger.info('compare_request', {
      sessionId: input.sessionId,
      userId: input.ownerId ?? null,
      queryEmbeddingHash,
      topK: input.topK,
      locale: input.locale,
      durationMs: Date.now() - startedAt,
      matchesCount: result.matches.length,
      ...(result.fallbackReason !== undefined ? { fallbackReason: result.fallbackReason } : {}),
    });

    return result;
  };
}
