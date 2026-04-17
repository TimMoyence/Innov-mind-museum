import { KnowledgeExtractionModule } from '@modules/knowledge-extraction/index';
import { auditService } from '@shared/audit';
import { logger } from '@shared/logger/logger';
import { fireAndForget } from '@shared/utils/fire-and-forget';
import { env } from '@src/config/env';

import { TypeOrmArtKeywordRepository } from './adapters/secondary/artKeyword.repository.typeorm';
import { OpenAiAudioTranscriber } from './adapters/secondary/audio-transcriber.openai';
import { BraveSearchClient } from './adapters/secondary/brave-search.client';
import { CachingChatOrchestrator } from './adapters/secondary/caching-chat-orchestrator';
import { TypeOrmChatRepository } from './adapters/secondary/chat.repository.typeorm';
import { DuckDuckGoClient } from './adapters/secondary/duckduckgo.client';
import { FallbackSearchProvider } from './adapters/secondary/fallback-search.provider';
import { GoogleCseClient } from './adapters/secondary/google-cse.client';
import { S3CompatibleImageStorage } from './adapters/secondary/image-storage.s3';
import { LocalImageStorage } from './adapters/secondary/image-storage.stub';
import { LangChainChatOrchestrator } from './adapters/secondary/langchain.orchestrator';
import { TesseractOcrService, DisabledOcrService } from './adapters/secondary/ocr-service';
import { RegexPiiSanitizer } from './adapters/secondary/pii-sanitizer.regex';
import { SearXNGClient } from './adapters/secondary/searxng.client';
import { TavilyClient } from './adapters/secondary/tavily.client';
import {
  OpenAiTextToSpeechService,
  DisabledTextToSpeechService,
} from './adapters/secondary/text-to-speech.openai';
import { UnsplashClient } from './adapters/secondary/unsplash.client';
import { TypeOrmUserMemoryRepository } from './adapters/secondary/userMemory.repository.typeorm';
import { WikidataClient } from './adapters/secondary/wikidata.client';
import { ArtTopicClassifier } from './useCase/art-topic-classifier';
import { ChatService } from './useCase/chat.service';
import { DescribeService } from './useCase/describe.service';
import { ImageEnrichmentService } from './useCase/image-enrichment.service';
import { KnowledgeBaseService } from './useCase/knowledge-base.service';
import { LocationResolver } from './useCase/location-resolver';
import { UserMemoryService } from './useCase/user-memory.service';
import { WebSearchService } from './useCase/web-search.service';

import type { ArtKeywordRepository } from './domain/artKeyword.repository.interface';
import type { ChatOrchestrator } from './domain/ports/chat-orchestrator.port';
import type { ImageStorage } from './domain/ports/image-storage.port';
import type { OcrService } from './domain/ports/ocr.port';
import type { WebSearchProvider } from './domain/ports/web-search.port';
import type { BuiltKnowledgeExtractionModule } from '@modules/knowledge-extraction/index';
import type { IMuseumRepository } from '@modules/museum/domain/museum.repository.interface';
import type { CacheService } from '@shared/cache/cache.port';
import type { DataSource } from 'typeorm';

/** Typed result of building the chat module — all services guaranteed initialized. */
export interface BuiltChatModule {
  chatService: ChatService;
  describeService: DescribeService;
  imageStorage: ImageStorage;
  repository: TypeOrmChatRepository;
  ocrService: OcrService;
  userMemoryService: UserMemoryService | undefined;
  artKeywordRepository: ArtKeywordRepository;
}

/**
 * Encapsulates the chat module dependency graph and lifecycle.
 * Call {@link build} to wire all dependencies; access them via {@link getBuilt}.
 */
export class ChatModule {
  private _built: BuiltChatModule | undefined;
  private _orchestrator: LangChainChatOrchestrator | undefined;
  private _artKeywordsRefreshTimer: ReturnType<typeof setInterval> | undefined;
  private _knowledgeExtractionClose: (() => Promise<void>) | undefined;

  /** Returns true if the module has been built. */
  isBuilt(): boolean {
    return this._built !== undefined;
  }

  /** Returns the built module or throws if {@link build} hasn't been called. */
  getBuilt(): BuiltChatModule {
    if (!this._built) {
      throw new Error('ChatModule.build() must be called before accessing services');
    }
    return this._built;
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

  /** Gracefully shuts down the knowledge extraction BullMQ worker. */
  async stopKnowledgeExtraction(): Promise<void> {
    await this._knowledgeExtractionClose?.();
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

  /** Creates the art-topic classifier if the feature flag is enabled. */
  private buildArtTopicClassifier(): ArtTopicClassifier | undefined {
    return env.featureFlags.artTopicClassifier ? new ArtTopicClassifier() : undefined;
  }

  /** Creates the user memory service if the feature flag is enabled. */
  private buildUserMemory(
    dataSource: DataSource,
    cache?: CacheService,
  ): UserMemoryService | undefined {
    if (!env.featureFlags.userMemory) return undefined;
    const repo = new TypeOrmUserMemoryRepository(dataSource);
    return new UserMemoryService(repo, cache);
  }

  /** Creates the knowledge base service if the feature flag is enabled. */
  private buildKnowledgeBase(cache?: CacheService): KnowledgeBaseService | undefined {
    if (!env.featureFlags.knowledgeBase) return undefined;
    const wikidataClient = new WikidataClient();
    return new KnowledgeBaseService(
      wikidataClient,
      {
        timeoutMs: env.knowledgeBase.timeoutMs,
        cacheTtlSeconds: env.knowledgeBase.cacheTtlSeconds,
        cacheMaxEntries: env.knowledgeBase.cacheMaxEntries,
      },
      cache,
    );
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

  /** Builds the knowledge extraction module (DB lookup + background pipeline). */
  private buildKnowledgeExtraction(dataSource: DataSource): BuiltKnowledgeExtractionModule {
    return new KnowledgeExtractionModule().build(dataSource);
  }

  /** Wraps orchestrator with caching decorator if cache is available. */
  private buildEffectiveOrchestrator(
    orchestrator: LangChainChatOrchestrator,
    cache?: CacheService,
  ): ChatOrchestrator {
    if (!cache) return orchestrator;
    return new CachingChatOrchestrator({
      delegate: orchestrator,
      cache,
      ttlSeconds: env.cache?.llmTtlSeconds ?? 604_800,
      popularityZsetTtlSeconds: env.cache?.llmPopularityTtlSeconds ?? 2_592_000,
      piiSanitizer: new RegexPiiSanitizer(),
    });
  }

  /** Creates the web search service with multi-provider fallback chain. */
  private buildWebSearch(cache?: CacheService): WebSearchService | undefined {
    if (!env.featureFlags.webSearch) return undefined;

    const providers: WebSearchProvider[] = [];

    if (env.webSearch.tavilyApiKey) {
      providers.push(new TavilyClient(env.webSearch.tavilyApiKey));
    }
    if (env.webSearch.googleCseApiKey && env.webSearch.googleCseId) {
      providers.push(new GoogleCseClient(env.webSearch.googleCseApiKey, env.webSearch.googleCseId));
    }
    if (env.webSearch.braveSearchApiKey) {
      providers.push(new BraveSearchClient(env.webSearch.braveSearchApiKey));
    }
    if (env.webSearch.searxngInstances.length > 0) {
      providers.push(new SearXNGClient(env.webSearch.searxngInstances));
    }
    // DuckDuckGo: always available, no key needed — last resort
    providers.push(new DuckDuckGoClient());

    logger.info('web_search_providers_configured', {
      providers: providers.map((p) => p.name ?? 'unknown'),
      count: providers.length,
    });

    const fallbackProvider = new FallbackSearchProvider(providers);
    return new WebSearchService(
      fallbackProvider,
      {
        timeoutMs: env.webSearch.timeoutMs,
        cacheTtlSeconds: env.webSearch.cacheTtlSeconds,
        maxResults: env.webSearch.maxResults,
      },
      cache,
    );
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
   * Wires the chat module dependency graph and returns all services as a typed object.
   *
   * @param dataSource - Initialized TypeORM DataSource for repository creation.
   * @param cache - Optional cache service for session/memory caching.
   * @param museumRepository - Optional museum repository for resolving museum info at session creation.
   * @returns Built module with all services guaranteed initialized.
   */
  build(
    dataSource: DataSource,
    cache?: CacheService,
    museumRepository?: IMuseumRepository,
  ): BuiltChatModule {
    const imageStorage = this.buildImageStorage();
    const repository = new TypeOrmChatRepository(dataSource);
    const tts =
      env.tts?.enabled && env.llm.openAiApiKey
        ? new OpenAiTextToSpeechService()
        : new DisabledTextToSpeechService();
    const ocr = env.featureFlags.ocrGuard ? new TesseractOcrService() : new DisabledOcrService();
    const userMemory = this.buildUserMemory(dataSource, cache);
    const knowledgeBase = this.buildKnowledgeBase(cache);
    const imageEnrichment = this.buildImageEnrichment();
    const webSearch = this.buildWebSearch(cache);

    const artKeywordRepo = new TypeOrmArtKeywordRepository(dataSource);

    this.buildArtKeywordRefresh(artKeywordRepo);

    const orchestrator = new LangChainChatOrchestrator();
    this._orchestrator = orchestrator;
    const effectiveOrchestrator = this.buildEffectiveOrchestrator(orchestrator, cache);

    const locationResolver = museumRepository
      ? new LocationResolver(museumRepository, cache)
      : undefined;

    const knowledgeExtraction = this.buildKnowledgeExtraction(dataSource);
    this._knowledgeExtractionClose = knowledgeExtraction.close;
    const chatService = new ChatService({
      repository,
      orchestrator: effectiveOrchestrator,
      imageStorage,
      audioTranscriber: new OpenAiAudioTranscriber(),
      tts,
      cache,
      ocr,
      audit: auditService,
      userMemory,
      knowledgeBase,
      imageEnrichment,
      webSearch,
      artTopicClassifier: this.buildArtTopicClassifier(),
      piiSanitizer: new RegexPiiSanitizer(),
      museumRepository,
      dbLookup: knowledgeExtraction.dbLookup,
      extractionQueue: knowledgeExtraction.extractionQueue,
      locationResolver,
    });

    const describeService = new DescribeService({ orchestrator: effectiveOrchestrator, tts });

    const built: BuiltChatModule = {
      chatService,
      describeService,
      imageStorage,
      repository,
      ocrService: ocr,
      userMemoryService: userMemory,
      artKeywordRepository: artKeywordRepo,
    };
    this._built = built;
    return built;
  }
}
