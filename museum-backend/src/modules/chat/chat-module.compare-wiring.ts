/**
 * C3 Visual Similarity (T5.5) — composition root for the `POST /chat/compare`
 * pipeline. Extracted from `chat-module.ts` to keep that file under the
 * project-wide `max-lines` budget (400) — the additive wiring this file holds
 * is invoked from `ChatModule.build` via {@link buildCompareImageUseCase}.
 *
 * Wiring graph:
 *
 *   1. {@link createEmbeddingsAdapter} — SigLIP-ONNX (default) or Replicate.
 *   2. {@link ArtworkEmbeddingRepositoryPg} — pgvector kNN catalog (Phase 4).
 *   3. {@link WikidataEnricher} — batch lookup with cache-aside + concurrency cap.
 *   4. {@link VisualSimilarityService} — orchestrator (cache → encode → kNN →
 *      enrich → score+fuse → top-K).
 *   5. Image processor adapter — wraps the existing `ImageProcessingService`
 *      so the compare pipeline re-uses the EXIF strip + magic-byte + MIME +
 *      size guard from chat-message ingestion (R12 — no duplication).
 *   6. Chat persistence adapter — wraps `ChatRepository.persistMessage` so the
 *      assistant turn carrying the {@link CompareResult} envelope lands in the
 *      same conversation row as the rest of the session.
 *   7. {@link createCompareImageUseCase} — partial-application returns the
 *      `(input) => Promise<CompareResult>` signature consumed by
 *      `createCompareRouter` (T6.3).
 *
 * Callers that omit `cache` get the {@link NoopCacheService} fallback so the
 * top-K result cache and Wikidata enricher cache remain functional (no-op,
 * fail-soft) without requiring Redis. The Wikidata client is instantiated
 * locally to keep this composer self-contained — the `KnowledgeBaseService`
 * instance built elsewhere in `ChatModule.build` is intentionally not
 * exposed across the module boundary.
 */
import { createEmbeddingsAdapter } from '@modules/chat/adapters/secondary/embeddings/embeddings.factory';
import { SharpImageProcessor } from '@modules/chat/adapters/secondary/image/image-processing.service';
import { ArtworkEmbeddingRepositoryPg } from '@modules/chat/adapters/secondary/persistence/artwork-embedding.repository.pg';
import { WikidataClient } from '@modules/chat/adapters/secondary/search/wikidata.client';
import { ImageProcessingService as ImageProcessingPipelineService } from '@modules/chat/useCase/image/image-processing.service';
import { compareImageUseCase as createCompareImageUseCase } from '@modules/chat/useCase/visual-similarity/compare.use-case';
import { VisualSimilarityService } from '@modules/chat/useCase/visual-similarity/similarity.service';
import { WikidataEnricher } from '@modules/chat/useCase/visual-similarity/wikidata-enricher';
import { NoopCacheService } from '@shared/cache/noop-cache.service';
import { env } from '@src/config/env';

import type { TypeOrmChatRepository } from '@modules/chat/adapters/secondary/persistence/chat.repository.typeorm';
import type { ImageStorage } from '@modules/chat/domain/ports/image-storage.port';
import type { OcrService } from '@modules/chat/domain/ports/ocr.port';
import type { CompareResult } from '@modules/chat/domain/visual-similarity/compare-result.types';
import type {
  CompareUseCaseInput,
  CompareMimeType,
  ChatPersistencePort,
  ImageProcessorPort as CompareImageProcessorPort,
} from '@modules/chat/useCase/visual-similarity/compare.use-case';
import type { CacheService } from '@shared/cache/cache.port';
import type { DataSource } from 'typeorm';

/**
 * Adapt the existing `ImageProcessingService.processImage` (which speaks
 * `PostMessageInput['image']`) to the structural `ImageProcessorPort` the
 * compare use case expects (Buffer in / Buffer out). Re-encodes the buffer
 * as a base64 upload payload and unwraps the cleaned base64 back to bytes.
 * R12 — re-uses the existing pipeline (EXIF strip + magic-byte + MIME +
 * size guard); no duplicated logic here.
 */
function buildCompareImageProcessor(
  imageStorage: ImageStorage,
  ocr: OcrService,
): CompareImageProcessorPort {
  const imageProcessingPipeline = new ImageProcessingPipelineService({
    imageStorage,
    ocr,
    imageProcessor: new SharpImageProcessor(),
  });
  return {
    async process(input) {
      const inputMime: CompareMimeType = input.mimeType;
      const inputBase64 = input.buffer.toString('base64');
      const processed = await imageProcessingPipeline.processImage(
        {
          source: 'upload',
          value: inputBase64,
          mimeType: inputMime,
          sizeBytes: input.buffer.byteLength,
        },
        input.sessionId,
        input.ownerId,
      );
      const orchImage = processed.orchestratorImage;
      const cleanedBuffer = Buffer.from(orchImage.value, 'base64');
      // The pipeline only accepts the three MIME types declared by
      // `CompareMimeType`, but its return type is the broader
      // `PostMessageInput['image'].mimeType` (`string | undefined`). Coerce
      // back to the narrowed union — `assertMimeType` upstream guarantees
      // it is one of the three.
      const cleanedMime: CompareMimeType =
        (orchImage.mimeType as CompareMimeType | undefined) ?? inputMime;
      return { buffer: cleanedBuffer, mimeType: cleanedMime };
    },
  };
}

/**
 * Adapt the chat repository to the `ChatPersistencePort` the compare use
 * case expects. Persists an assistant message carrying the full
 * {@link CompareResult} envelope under `metadata.compareResults` (the use
 * case also mirrors `fallbackReason` at the top level for consumers that
 * only inspect the flat metadata bag).
 */
function buildCompareChatPersistence(repository: TypeOrmChatRepository): ChatPersistencePort {
  return {
    async appendAssistantMessage(opts) {
      const persisted = await repository.persistMessage({
        sessionId: opts.sessionId,
        role: 'assistant',
        ...(opts.text !== undefined ? { text: opts.text } : {}),
        ...(opts.metadata !== undefined ? { metadata: opts.metadata } : {}),
      });
      return { id: persisted.id };
    },
  };
}

/**
 * Compose the `compareImageUseCase` partially-applied function used by the
 * `POST /chat/compare` route handler. Invoked once at boot from
 * `ChatModule.build`; the returned closure is safe to share across requests
 * (no per-call state lives on it).
 *
 * @param repository - Chat repository — the assistant message is persisted
 *   via `repository.persistMessage` rather than going through `ChatService`
 *   so the C3 result envelope is appended without re-running guardrails /
 *   orchestration (the `CompareResult` is already fully formed).
 * @param dataSource - TypeORM `DataSource` — wraps the pgvector raw queries
 *   used by {@link ArtworkEmbeddingRepositoryPg}.
 * @param imageStorage - Existing image storage adapter — re-used by the
 *   image processor adapter so EXIF-stripped uploads land under the same
 *   key prefix as chat-message uploads.
 * @param ocr - OCR service injected into the image processor for the
 *   prompt-injection guardrail.
 * @param cache - Optional cache backend. Falls back to {@link NoopCacheService}
 *   when undefined so the top-K result cache + Wikidata enricher cache stay
 *   functional in dev / test environments without Redis.
 */
export function buildCompareImageUseCase(
  repository: TypeOrmChatRepository,
  dataSource: DataSource,
  imageStorage: ImageStorage,
  ocr: OcrService,
  cache: CacheService | undefined,
): (input: CompareUseCaseInput) => Promise<CompareResult> {
  const cacheBackend: CacheService = cache ?? new NoopCacheService();

  const embeddingsAdapter = createEmbeddingsAdapter(env);
  const artworkEmbeddingRepo = new ArtworkEmbeddingRepositoryPg(dataSource);

  const wikidataClient = new WikidataClient();
  const wikidataEnricher = new WikidataEnricher({
    client: wikidataClient,
    cache: cacheBackend,
  });

  const visualSimilarityService = new VisualSimilarityService({
    encoder: embeddingsAdapter,
    repo: artworkEmbeddingRepo,
    enricher: wikidataEnricher,
    cache: cacheBackend,
    weights: {
      wVisual: env.visualSimilarity.wVisual,
      wMeta: env.visualSimilarity.wMeta,
    },
    topN: env.visualSimilarity.topN,
    topK: env.visualSimilarity.topKDefault,
  });

  return createCompareImageUseCase({
    imageProcessor: buildCompareImageProcessor(imageStorage, ocr),
    similarityService: visualSimilarityService,
    chatService: buildCompareChatPersistence(repository),
  });
}
