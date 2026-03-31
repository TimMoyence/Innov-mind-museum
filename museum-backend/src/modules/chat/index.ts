import { auditService } from '@shared/audit';
import { logger } from '@shared/logger/logger';
import { fireAndForget } from '@shared/utils/fire-and-forget';
import { env } from '@src/config/env';

import { OpenAiAudioTranscriber } from './adapters/secondary/audio-transcriber.openai';
import { S3CompatibleImageStorage } from './adapters/secondary/image-storage.s3';
import { LocalImageStorage } from './adapters/secondary/image-storage.stub';
import { LangChainChatOrchestrator } from './adapters/secondary/langchain.orchestrator';
import { TesseractOcrService, DisabledOcrService } from './adapters/secondary/ocr-service';
import {
  OpenAiTextToSpeechService,
  DisabledTextToSpeechService,
} from './adapters/secondary/text-to-speech.openai';
import { UnsplashClient } from './adapters/secondary/unsplash.client';
import { WikidataClient } from './adapters/secondary/wikidata.client';
import { ArtTopicClassifier } from './application/art-topic-classifier';
import { ChatService } from './application/chat.service';
import { ImageEnrichmentService } from './application/image-enrichment.service';
import { KnowledgeBaseService } from './application/knowledge-base.service';
import { UserMemoryService } from './application/user-memory.service';
import { TypeOrmArtKeywordRepository } from './infrastructure/artKeyword.repository.typeorm';
import { TypeOrmChatRepository } from './infrastructure/chat.repository.typeorm';
import { TypeOrmUserMemoryRepository } from './infrastructure/userMemory.repository.typeorm';

import type { ArtKeywordRepository } from './domain/artKeyword.repository.interface';
import type { OcrService } from './domain/ports/ocr.port';
import type { CacheService } from '@shared/cache/cache.port';
import type { DataSource } from 'typeorm';

/**
 * Encapsulates the chat module dependency graph and lifecycle.
 * All services are lazily initialized via {@link build} and accessible via typed getters.
 */
class ChatModule {
  private _imageStorage: LocalImageStorage | S3CompatibleImageStorage | undefined;
  private _repository: TypeOrmChatRepository | undefined;
  private _ocrService: OcrService | undefined;
  private _userMemoryService: UserMemoryService | undefined;
  private _artKeywordRepository: ArtKeywordRepository | undefined;
  private _orchestrator: LangChainChatOrchestrator | undefined;
  private _artKeywordsRefreshTimer: ReturnType<typeof setInterval> | undefined;

  get imageStorage(): LocalImageStorage | S3CompatibleImageStorage | undefined {
    return this._imageStorage;
  }

  get repository(): TypeOrmChatRepository | undefined {
    return this._repository;
  }

  get ocrService(): OcrService | undefined {
    return this._ocrService;
  }

  get userMemoryService(): UserMemoryService | undefined {
    return this._userMemoryService;
  }

  get artKeywordRepository(): ArtKeywordRepository | undefined {
    return this._artKeywordRepository;
  }

  /** Returns the LLM circuit breaker state for the health endpoint. */
  getLlmCircuitBreakerState():
    | { state: 'CLOSED' | 'OPEN' | 'HALF_OPEN'; failureCount: number; lastFailureAt: Date | null }
    | undefined {
    return this._orchestrator?.getCircuitBreakerState();
  }

  /** Stops the periodic art-keywords refresh timer. Call during graceful shutdown. */
  stopArtKeywordsRefresh(): void {
    if (this._artKeywordsRefreshTimer) {
      clearInterval(this._artKeywordsRefreshTimer);
      this._artKeywordsRefreshTimer = undefined;
    }
  }

  /** Creates the image storage adapter (S3 or local) based on env config. */
  private buildImageStorage(): LocalImageStorage | S3CompatibleImageStorage {
    if (env.storage.driver === 's3') {
      const s3 = env.storage.s3;
      if (!s3?.endpoint || !s3.region || !s3.bucket || !s3.accessKeyId || !s3.secretAccessKey) {
        throw new Error(
          'OBJECT_STORAGE_DRIVER=s3 requires S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY',
        );
      }

      return new S3CompatibleImageStorage({
        endpoint: s3.endpoint,
        region: s3.region,
        bucket: s3.bucket,
        accessKeyId: s3.accessKeyId,
        secretAccessKey: s3.secretAccessKey,
        signedUrlTtlSeconds: env.storage.signedUrlTtlSeconds,
        publicBaseUrl: s3.publicBaseUrl,
        sessionToken: s3.sessionToken,
        objectKeyPrefix: s3.objectKeyPrefix,
        requestTimeoutMs: env.requestTimeoutMs,
      });
    }
    return new LocalImageStorage(env.storage.localUploadsDir);
  }

  /** Creates the user memory service if the feature flag is enabled. */
  private buildUserMemory(
    dataSource: DataSource,
    cache?: CacheService,
  ): UserMemoryService | undefined {
    if (!env.featureFlags.userMemory) return undefined;
    const repo = new TypeOrmUserMemoryRepository(dataSource);
    const service = new UserMemoryService(repo, cache);
    this._userMemoryService = service;
    return service;
  }

  /** Creates the knowledge base service if the feature flag is enabled. */
  private buildKnowledgeBase(): KnowledgeBaseService | undefined {
    if (!env.featureFlags.knowledgeBase) return undefined;
    const wikidataClient = new WikidataClient();
    return new KnowledgeBaseService(wikidataClient, {
      timeoutMs: env.knowledgeBase.timeoutMs,
      cacheTtlSeconds: env.knowledgeBase.cacheTtlSeconds,
      cacheMaxEntries: env.knowledgeBase.cacheMaxEntries,
    });
  }

  /** Creates the image enrichment service if the feature flag is enabled. */
  private buildImageEnrichment(): ImageEnrichmentService | undefined {
    if (!env.featureFlags.imageEnrichment) return undefined;
    const unsplashClient = env.imageEnrichment.unsplashAccessKey
      ? new UnsplashClient(env.imageEnrichment.unsplashAccessKey)
      : undefined;
    return new ImageEnrichmentService(unsplashClient, {
      cacheTtlMs: env.imageEnrichment.cacheTtlMs,
      cacheMaxEntries: env.imageEnrichment.cacheMaxEntries,
      fetchTimeoutMs: env.imageEnrichment.fetchTimeoutMs,
      maxImagesPerResponse: env.imageEnrichment.maxImagesPerResponse,
    });
  }

  /** Sets up the dynamic art keyword set with periodic refresh from the database. */
  private buildArtKeywordRefresh(artKeywordRepo: TypeOrmArtKeywordRepository): {
    dynamicArtKeywords: Set<string>;
    onArtKeywordDiscovered: (keyword: string, locale: string) => void;
  } {
    const dynamicArtKeywords = new Set<string>();
    const refreshKeywords = async () => {
      try {
        const rows = await artKeywordRepo.findByLocale('%');
        dynamicArtKeywords.clear();
        for (const row of rows) {
          dynamicArtKeywords.add(row.keyword);
        }
      } catch (error) {
        logger.warn('art_keywords_refresh_failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    void refreshKeywords();
    const timer = setInterval(() => void refreshKeywords(), 5 * 60 * 1000);
    timer.unref(); // allow process/Jest to exit without waiting for this timer
    this._artKeywordsRefreshTimer = timer;

    const onArtKeywordDiscovered = (keyword: string, locale: string) => {
      const normalized = keyword.toLowerCase().trim();
      if (!normalized || dynamicArtKeywords.has(normalized)) return;
      dynamicArtKeywords.add(normalized);
      fireAndForget(artKeywordRepo.upsert(normalized, locale), 'art_keyword_upsert');
    };

    return { dynamicArtKeywords, onArtKeywordDiscovered };
  }

  /**
   * Wires the chat module dependency graph and returns a fully configured ChatService.
   *
   * @param dataSource - Initialized TypeORM DataSource for repository creation.
   * @param cache - Optional cache service for session/memory caching.
   * @returns ChatService with repository, orchestrator, image storage, and audio transcriber.
   */
  build(dataSource: DataSource, cache?: CacheService): ChatService {
    const imageStorage = this.buildImageStorage();
    this._imageStorage = imageStorage;

    const repository = new TypeOrmChatRepository(dataSource);
    this._repository = repository;

    const tts =
      env.tts?.enabled && env.llm.openAiApiKey
        ? new OpenAiTextToSpeechService()
        : new DisabledTextToSpeechService();

    const ocr = env.featureFlags.ocrGuard ? new TesseractOcrService() : new DisabledOcrService();
    this._ocrService = ocr;

    const userMemory = this.buildUserMemory(dataSource, cache);
    const knowledgeBase = this.buildKnowledgeBase();
    const imageEnrichment = this.buildImageEnrichment();

    const artKeywordRepo = new TypeOrmArtKeywordRepository(dataSource);
    this._artKeywordRepository = artKeywordRepo;

    const { dynamicArtKeywords, onArtKeywordDiscovered } =
      this.buildArtKeywordRefresh(artKeywordRepo);

    const orchestrator = new LangChainChatOrchestrator();
    this._orchestrator = orchestrator;

    return new ChatService({
      repository,
      orchestrator,
      imageStorage,
      audioTranscriber: new OpenAiAudioTranscriber(),
      tts,
      cache,
      ocr,
      audit: auditService,
      userMemory,
      knowledgeBase,
      imageEnrichment,
      dynamicArtKeywords,
      artTopicClassifier: new ArtTopicClassifier(),
      onArtKeywordDiscovered,
    });
  }
}

// ── Module singleton + backward-compatible exports ──────────────────────────

/** Module singleton. Use the getter functions below for cross-module access. */
export const chatModule = new ChatModule();

/** Wires the chat module and returns a configured ChatService. */
export const buildChatService = (dataSource: DataSource, cache?: CacheService): ChatService =>
  chatModule.build(dataSource, cache);

/** Returns the shared image storage instance (available after buildChatService). */
export const getImageStorage = () => chatModule.imageStorage;

/** Returns the shared chat repository instance (available after buildChatService). */
export const getChatRepository = () => chatModule.repository;

/** Returns the shared OCR service instance (available after buildChatService). */
export const getOcrService = () => chatModule.ocrService;

/** Returns the shared user-memory service instance (available after buildChatService). */
export const getUserMemoryService = () => chatModule.userMemoryService;

/** Returns the shared art keyword repository (available after buildChatService). */
export const getArtKeywordRepository = () => chatModule.artKeywordRepository;

/** Returns the LLM circuit breaker state for the health endpoint. */
export const getLlmCircuitBreakerState = () => chatModule.getLlmCircuitBreakerState();

/** Stops the periodic art-keywords refresh timer. Call during graceful shutdown. */
export const stopArtKeywordsRefresh = () => {
  chatModule.stopArtKeywordsRefresh();
};
