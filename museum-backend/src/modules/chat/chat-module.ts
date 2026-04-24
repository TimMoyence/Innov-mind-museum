import { KnowledgeExtractionModule } from '@modules/knowledge-extraction/index';
import { auditService } from '@shared/audit';
import { logger } from '@shared/logger/logger';
import { fireAndForget } from '@shared/utils/fire-and-forget';
import { env } from '@src/config/env';

import { TypeOrmArtKeywordRepository } from './adapters/secondary/artKeyword.repository.typeorm';
import { S3CompatibleAudioStorage } from './adapters/secondary/audio-storage.s3';
import { LocalAudioStorage } from './adapters/secondary/audio-storage.stub';
import { OpenAiAudioTranscriber } from './adapters/secondary/audio-transcriber.openai';
import { BraveSearchClient } from './adapters/secondary/brave-search.client';
import { CachingChatOrchestrator } from './adapters/secondary/caching-chat-orchestrator';
import { TypeOrmChatRepository } from './adapters/secondary/chat.repository.typeorm';
import { DuckDuckGoClient } from './adapters/secondary/duckduckgo.client';
import { FallbackSearchProvider } from './adapters/secondary/fallback-search.provider';
import { GoogleCseClient } from './adapters/secondary/google-cse.client';
import { LLMGuardAdapter } from './adapters/secondary/guardrails/llm-guard.adapter';
import { S3CompatibleImageStorage } from './adapters/secondary/image-storage.s3';
import { LocalImageStorage } from './adapters/secondary/image-storage.stub';
import { LangChainChatOrchestrator } from './adapters/secondary/langchain.orchestrator';
import { TesseractOcrService, type DisabledOcrService } from './adapters/secondary/ocr-service';
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
import type { AdvancedGuardrail } from './domain/ports/advanced-guardrail.port';
import type { AudioStorage } from './domain/ports/audio-storage.port';
import type { ChatOrchestrator } from './domain/ports/chat-orchestrator.port';
import type { ImageStorage } from './domain/ports/image-storage.port';
import type { OcrService } from './domain/ports/ocr.port';
import type { WebSearchProvider } from './domain/ports/web-search.port';
import type { LocationConsentChecker } from './useCase/location-resolver';
import type { ArtworkKnowledgeRepoPort } from '@modules/knowledge-extraction/domain/ports/artwork-knowledge-repo.port';
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
  artworkKnowledgeRepo?: ArtworkKnowledgeRepoPort;
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

  /**
   * Creates the audio storage adapter (S3 or local). Mirrors {@link buildImageStorage}
   * — TTS audio uses the same S3 backend / local dir as images, just under a different
   * key prefix (`chat-audios/`). Returns `undefined` when storage is misconfigured so
   * the chat service still operates (TTS just runs without long-term persistence).
   */
  private buildAudioStorage(): AudioStorage | undefined {
    if (env.storage.driver === 's3') {
      const s3 = env.storage.s3;
      if (!s3?.endpoint || !s3.region || !s3.bucket || !s3.accessKeyId || !s3.secretAccessKey) {
        return undefined;
      }
      return new S3CompatibleAudioStorage({
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
    return new LocalAudioStorage();
  }

  /**
   * Creates the advanced guardrail V2 adapter when one is selected via env.
   * Returns `undefined` when candidate is 'off' (default) so the service layer
   * installs the noop path (no runtime cost).
   */
  private buildAdvancedGuardrail(): AdvancedGuardrail | undefined {
    const candidate = env.guardrails.candidate;
    if (candidate === 'off') return undefined;

    if (candidate === 'llm-guard') {
      const baseUrl = env.guardrails.llmGuardUrl;
      if (!baseUrl) {
        logger.warn('advanced_guardrail_misconfigured', {
          candidate,
          detail: 'GUARDRAILS_V2_LLM_GUARD_URL is required when candidate=llm-guard',
        });
        return undefined;
      }
      return new LLMGuardAdapter({ baseUrl, timeoutMs: env.guardrails.timeoutMs });
    }

    // nemo and prompt-armor adapters are not yet implemented; fall back to noop.
    logger.info('advanced_guardrail_adapter_pending', { candidate });
    return undefined;
  }

  /** Creates the user memory service (always active in V1). */
  private buildUserMemory(
    dataSource: DataSource,
    cache?: CacheService,
  ): UserMemoryService | undefined {
    const repo = new TypeOrmUserMemoryRepository(dataSource);
    return new UserMemoryService(repo, cache);
  }

  /** Creates the knowledge base service (Wikidata, always active in V1). */
  private buildKnowledgeBase(cache?: CacheService): KnowledgeBaseService | undefined {
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
  /** Creates image enrichment (Unsplash + Wikidata P18). Natural gate: Unsplash key presence. */
  private buildImageEnrichment(): ImageEnrichmentService | undefined {
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

  /** Creates web search with multi-provider fallback. Natural gate: provider key presence. DuckDuckGo always included as last resort. */
  private buildWebSearch(cache?: CacheService): WebSearchService | undefined {
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
    // TTS is always wired in V1 — falls back to Disabled only when no OpenAI key (dev safety).
    const tts = env.llm.openAiApiKey
      ? new OpenAiTextToSpeechService()
      : new DisabledTextToSpeechService();
    const ocr = new TesseractOcrService();
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

    const locationConsentChecker = buildLocationConsentChecker();

    const knowledgeExtraction = this.buildKnowledgeExtraction(dataSource);
    this._knowledgeExtractionClose = knowledgeExtraction.close;

    const chatService = this.buildChatService({
      repository,
      effectiveOrchestrator,
      imageStorage,
      tts,
      cache,
      ocr,
      userMemory,
      knowledgeBase,
      imageEnrichment,
      webSearch,
      museumRepository,
      locationResolver,
      locationConsentChecker,
      knowledgeExtraction,
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
      artworkKnowledgeRepo: knowledgeExtraction.artworkKnowledgeRepo,
    };
    this._built = built;
    return built;
  }

  /**
   * Wires ChatService with all its dependencies. Extracted from build() to keep
   * the orchestration flow (storage → caches → orchestrator → service) scannable
   * in a single screen without tripping the max-lines-per-function rule.
   */
  private buildChatService(deps: {
    repository: TypeOrmChatRepository;
    effectiveOrchestrator: ChatOrchestrator;
    imageStorage: LocalImageStorage | S3CompatibleImageStorage;
    tts: OpenAiTextToSpeechService | DisabledTextToSpeechService;
    cache?: CacheService;
    ocr: TesseractOcrService | DisabledOcrService;
    userMemory?: UserMemoryService;
    knowledgeBase?: KnowledgeBaseService;
    imageEnrichment?: ImageEnrichmentService;
    webSearch?: WebSearchService;
    museumRepository?: IMuseumRepository;
    locationResolver?: LocationResolver;
    locationConsentChecker?: LocationConsentChecker;
    knowledgeExtraction: ReturnType<ChatModule['buildKnowledgeExtraction']>;
  }): ChatService {
    return new ChatService({
      repository: deps.repository,
      orchestrator: deps.effectiveOrchestrator,
      imageStorage: deps.imageStorage,
      audioTranscriber: new OpenAiAudioTranscriber(),
      audioStorage: this.buildAudioStorage(),
      tts: deps.tts,
      cache: deps.cache,
      ocr: deps.ocr,
      audit: auditService,
      userMemory: deps.userMemory,
      knowledgeBase: deps.knowledgeBase,
      imageEnrichment: deps.imageEnrichment,
      webSearch: deps.webSearch,
      artTopicClassifier: new ArtTopicClassifier(),
      advancedGuardrail: this.buildAdvancedGuardrail(),
      advancedGuardrailObserveOnly: env.guardrails.observeOnly,
      piiSanitizer: new RegexPiiSanitizer(),
      museumRepository: deps.museumRepository,
      dbLookup: deps.knowledgeExtraction.dbLookup,
      extractionQueue: deps.knowledgeExtraction.extractionQueue,
      locationResolver: deps.locationResolver,
      locationConsentChecker: deps.locationConsentChecker,
    });
  }
}

/**
 * Builds the GDPR consent checker used by the chat pipeline to gate location
 * propagation to the third-party LLM. Lazy-imports the auth module so we don't
 * create a circular init between chat and auth at boot.
 */
function buildLocationConsentChecker(): LocationConsentChecker {
  return {
    async isGranted(userId: number, scope: 'location_to_llm'): Promise<boolean> {
      const { userConsentRepository } = await import('@modules/auth/useCase');
      return await userConsentRepository.isGranted(userId, scope);
    },
  };
}
