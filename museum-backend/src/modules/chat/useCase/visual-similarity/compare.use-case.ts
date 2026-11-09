import { createHash } from 'node:crypto';

import { logger } from '@shared/logger/logger';

import type { CompareResult } from '@modules/chat/domain/visual-similarity/compare-result.types';

export type CompareMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface ImageProcessorPort {
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
  buffer: Buffer;
  mimeType: CompareMimeType;
  topK: number;
  locale: 'fr' | 'en';
  museumQids?: string[];
  museumId?: number | null;
  ownerId?: number;
}

export function compareImageUseCase(
  deps: CompareUseCaseDeps,
): (input: CompareUseCaseInput) => Promise<CompareResult> {
  const { imageProcessor, similarityService, chatService } = deps;

  return async function runCompare(input: CompareUseCaseInput): Promise<CompareResult> {
    const startedAt = Date.now();
    const queryEmbeddingHash = createHash('sha256').update(input.buffer).digest('hex');

    const processed = await imageProcessor.process({
      sessionId: input.sessionId,
      buffer: input.buffer,
      mimeType: input.mimeType,
      ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
    });

    const compareInput: Parameters<SimilarityServicePort['compare']>[0] = {
      buffer: processed.buffer,
      mimeType: processed.mimeType,
      topK: input.topK,
      locale: input.locale,
      ...(input.museumQids !== undefined ? { museumQids: input.museumQids } : {}),
      ...(input.museumId !== undefined && input.museumId !== null
        ? { museumId: input.museumId }
        : {}),
    };
    const result = await similarityService.compare(compareInput);

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
