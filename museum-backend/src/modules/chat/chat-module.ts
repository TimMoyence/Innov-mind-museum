import { OpenAiAudioTranscriber } from '@modules/chat/adapters/secondary/audio/audio-transcriber.openai';
import {
  OpenAiTextToSpeechService,
  DisabledTextToSpeechService,
} from '@modules/chat/adapters/secondary/audio/text-to-speech.openai';
import { LLMGuardAdapter } from '@modules/chat/adapters/secondary/guardrails/llm-guard.adapter';
import { SharpImageProcessor } from '@modules/chat/adapters/secondary/image/image-processing.service';
import {
  TesseractOcrService,
  type DisabledOcrService,
} from '@modules/chat/adapters/secondary/image/ocr-service';
import { LangChainChatOrchestrator } from '@modules/chat/adapters/secondary/llm/langchain.orchestrator';
import { TypeOrmArtKeywordRepository } from '@modules/chat/adapters/secondary/persistence/artKeyword.repository.typeorm';
import { TypeOrmChatRepository } from '@modules/chat/adapters/secondary/persistence/chat.repository.typeorm';
import { TypeOrmUserMemoryRepository } from '@modules/chat/adapters/secondary/persistence/userMemory.repository.typeorm';
import { RegexPiiSanitizer } from '@modules/chat/adapters/secondary/pii/pii-sanitizer.regex';
import { BraveSearchClient } from '@modules/chat/adapters/secondary/search/brave-search.client';
import { DuckDuckGoClient } from '@modules/chat/adapters/secondary/search/duckduckgo.client';
import { FallbackSearchProvider } from '@modules/chat/adapters/secondary/search/fallback-search.provider';
import { GoogleCseClient } from '@modules/chat/adapters/secondary/search/google-cse.client';
import { MusaiumCatalogueClient } from '@modules/chat/adapters/secondary/search/musaium-catalogue.client';
import { SearXNGClient } from '@modules/chat/adapters/secondary/search/searxng.client';
import { TavilyClient } from '@modules/chat/adapters/secondary/search/tavily.client';
import { UnsplashClient } from '@modules/chat/adapters/secondary/search/unsplash.client';
import { WikimediaCommonsClient } from '@modules/chat/adapters/secondary/search/wikimedia-commons.client';
import { S3CompatibleAudioStorage } from '@modules/chat/adapters/secondary/storage/audio-storage.s3';
import { LocalAudioStorage } from '@modules/chat/adapters/secondary/storage/audio-storage.stub';
import { S3CompatibleImageStorage } from '@modules/chat/adapters/secondary/storage/image-storage.s3';
import { LocalImageStorage } from '@modules/chat/adapters/secondary/storage/image-storage.stub';
import { DescribeService } from '@modules/chat/useCase/describe/describe.service';
import { ArtTopicClassifier } from '@modules/chat/useCase/guardrail/art-topic-classifier';
import { configureGuardrailBudget } from '@modules/chat/useCase/guardrail/guardrail-budget';
import { ImageEnrichmentService } from '@modules/chat/useCase/image/image-enrichment.service';
import { judgeWithLlm } from '@modules/chat/useCase/llm/llm-judge-guardrail';
import { LocationResolver } from '@modules/chat/useCase/location/location-resolver';
import { UserMemoryService } from '@modules/chat/useCase/memory/user-memory.service';
import { ChatService } from '@modules/chat/useCase/orchestration/chat.service';
import { WebSearchService } from '@modules/chat/useCase/web-search/web-search.service';
import { KnowledgeExtractionModule } from '@modules/knowledge-extraction/index';
import { auditService } from '@shared/audit';
import { logger } from '@shared/logger/logger';
import { fireAndForget } from '@shared/utils/fire-and-forget';
import { env } from '@src/config/env';

import {
  buildCompareImageUseCase,
  buildCompareSessionAccessVerifier,
} from './chat-module.compare-wiring';
import { buildKnowledgeRouter } from './chat-module.knowledge-router-wiring';
import { buildWikidataStack } from './chat-module.wikidata-wiring';

import type { ArtKeywordRepository } from '@modules/chat/domain/art-keyword/artKeyword.repository.interface';
import type { AdvancedGuardrail } from '@modules/chat/domain/ports/advanced-guardrail.port';
import type { AudioStorage } from '@modules/chat/domain/ports/audio-storage.port';
import type { ChatOrchestrator } from '@modules/chat/domain/ports/chat-orchestrator.port';
import type { ImageStorage } from '@modules/chat/domain/ports/image-storage.port';
import type { KnowledgeRouterPort } from '@modules/chat/domain/ports/knowledge-router.port';
import type { OcrService } from '@modules/chat/domain/ports/ocr.port';
import type { WebSearchProvider } from '@modules/chat/domain/ports/web-search.port';
import type { CompareResult } from '@modules/chat/domain/visual-similarity/compare-result.types';
import type { KnowledgeBaseService } from '@modules/chat/useCase/knowledge/knowledge-base.service';
import type { LocationConsentChecker } from '@modules/chat/useCase/location/location-resolver';
import type { CompareUseCaseInput } from '@modules/chat/useCase/visual-similarity/compare.use-case';
import type { ArtworkKnowledgeRepoPort } from '@modules/knowledge-extraction/domain/ports/artwork-knowledge-repo.port';
import type { BuiltKnowledgeExtractionModule } from '@modules/knowledge-extraction/index';
import type { IMuseumRepository } from '@modules/museum/domain/museum/museum.repository.interface';
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
  /**
   * C3 Visual Similarity (T5.5) — partially-applied `compareImageUseCase` for
   * the `POST /chat/compare` route. Wired in {@link ChatModule.build}; the
   * route adapter (T6.3) consumes this single function. Optional because legacy
   * test harnesses build the module without the C3 pipeline.
   */
  compareImageUseCase?: (input: CompareUseCaseInput) => Promise<CompareResult>;
  /**
   * C3 Visual Similarity — session-ownership check piped to the compare router.
   * Closes over the chat repository so the route does not import persistence.
   * Optional in lockstep with `compareImageUseCase`.
   */
  compareSessionAccessVerifier?: (sessionId: string, ownerId: number | undefined) => Promise<void>;
  /**
   * C4.1 (2026-05-11) — `KnowledgeRouterService` wired by T3.3. Optional :
   * legacy test harnesses skip C4 ports + NFR8 keeps 1 cycle backward-compat.
   * Production always wires it (see `chat-module.knowledge-router-wiring.ts`).
   */
  knowledgeRouter?: KnowledgeRouterPort;
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

    return undefined;
  }

  /** Creates the user memory service (always active in V1). */
  private buildUserMemory(
    dataSource: DataSource,
    cache?: CacheService,
    artworkRepo?: ArtworkKnowledgeRepoPort,
  ): UserMemoryService | undefined {
    const repo = new TypeOrmUserMemoryRepository(dataSource);
    return new UserMemoryService(repo, cache, { artworkRepo });
  }

  private buildImageEnrichment(): ImageEnrichmentService | undefined {
    const unsplashClient = env.imageEnrichment.unsplashAccessKey
      ? new UnsplashClient(env.imageEnrichment.unsplashAccessKey)
      : undefined;
    const commonsClient = new WikimediaCommonsClient(env.imageEnrichment.fetchTimeoutMs);
    const musaiumClient = new MusaiumCatalogueClient();
    return new ImageEnrichmentService(
      unsplashClient,
      {
        cacheTtlMs: env.imageEnrichment.cacheTtlMs,
        cacheMaxEntries: env.imageEnrichment.cacheMaxEntries,
        fetchTimeoutMs: env.imageEnrichment.fetchTimeoutMs,
        maxImagesPerResponse: env.imageEnrichment.maxImagesPerResponse,
      },
      commonsClient,
      musaiumClient,
    );
  }

  /** Builds the knowledge extraction module (DB lookup + background pipeline). */
  private buildKnowledgeExtraction(dataSource: DataSource): BuiltKnowledgeExtractionModule {
    return new KnowledgeExtractionModule().build(dataSource);
  }

  /**
   * Creates web search with multi-provider fallback chain (shared with the
   * `KnowledgeRouterService` per T3.3). DuckDuckGo is always last-resort.
   */
  private buildWebSearch(cache?: CacheService): { service: WebSearchService; provider: WebSearchProvider } {
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
    const service = new WebSearchService(
      fallbackProvider,
      {
        timeoutMs: env.webSearch.timeoutMs,
        cacheTtlSeconds: env.webSearch.cacheTtlSeconds,
        maxResults: env.webSearch.maxResults,
      },
      cache,
    );
    return { service, provider: fallbackProvider };
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
  // eslint-disable-next-line max-lines-per-function -- Justification: composition root that intentionally wires every dependency in one place; splitting hides ordering invariants documented inline (artKeyword → orchestrator → guardrail-budget → userMemory). 1 LOC over the soft cap (61) post-ADR-030 wiring. Approved-by: tim@2026-05-05
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
    // C5.3 — shared Wikidata decorator chain (write-through → breaker → raw client).
    // `kbProvider` is reused below by `buildKnowledgeRouter` so the C4 router
    // path also benefits from the breaker + dump write-through.
    const { kbProvider, knowledgeBase } = buildWikidataStack(dataSource, cache);
    const imageEnrichment = this.buildImageEnrichment();
    const { service: webSearch, provider: wsProvider } = this.buildWebSearch(cache);

    const artKeywordRepo = new TypeOrmArtKeywordRepository(dataSource);
    this.buildArtKeywordRefresh(artKeywordRepo);

    const orchestrator = new LangChainChatOrchestrator();
    this._orchestrator = orchestrator;
    // Cache is owned by the use-case layer (LlmCacheServiceImpl) since
    // ADR-036 — no adapter-level decorator. The orchestrator is wired bare.
    const effectiveOrchestrator: ChatOrchestrator = orchestrator;
    configureGuardrailBudget({ cache }); // ADR-030 — judge budget Redis/in-process pick

    // C4.1 (T3.3) — `KnowledgeRouterService` wired after the orchestrator so
    // the LLM judge leg shares the live `ChatOrchestrator` instance. See
    // `chat-module.knowledge-router-wiring.ts` for the cascade contract.
    const knowledgeRouter = buildKnowledgeRouter(kbProvider, wsProvider, effectiveOrchestrator);
    const locationResolver = museumRepository
      ? new LocationResolver(museumRepository, cache)
      : undefined;
    const locationConsentChecker = buildLocationConsentChecker();

    const knowledgeExtraction = this.buildKnowledgeExtraction(dataSource);
    this._knowledgeExtractionClose = knowledgeExtraction.close;

    // UserMemory depends on the knowledge-extraction artwork repo for the
    // mergePeriods enrichment (Spec C T1.5) — must build *after* knowledgeExtraction.
    const userMemory = this.buildUserMemory(
      dataSource,
      cache,
      knowledgeExtraction.artworkKnowledgeRepo,
    );

    const chatService = this.buildChatService({
      repository,
      effectiveOrchestrator,
      imageStorage,
      tts,
      cache,
      ocr,
      userMemory,
      knowledgeBase,
      knowledgeRouter,
      imageEnrichment,
      webSearch,
      museumRepository,
      locationResolver,
      locationConsentChecker,
      knowledgeExtraction,
    });

    const describeService = new DescribeService({ orchestrator: effectiveOrchestrator, tts });

    // C3 Visual Similarity (T5.5) — wire the `POST /chat/compare` use case
    // plus the session-ownership verifier consumed by the route (security
    // BLOCKER 2026-05-10: parity with `ensureSessionAccess()` on every other
    // chat write path).
    const compareImageUseCase = buildCompareImageUseCase(
      repository,
      dataSource,
      imageStorage,
      ocr,
      cache,
    );
    const compareSessionAccessVerifier = buildCompareSessionAccessVerifier(repository);

    const built: BuiltChatModule = {
      chatService,
      describeService,
      imageStorage,
      repository,
      ocrService: ocr,
      userMemoryService: userMemory,
      artKeywordRepository: artKeywordRepo,
      artworkKnowledgeRepo: knowledgeExtraction.artworkKnowledgeRepo,
      compareImageUseCase,
      compareSessionAccessVerifier,
      knowledgeRouter, // C4.1 (T3.3) — see BuiltChatModule.knowledgeRouter docblock.
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
    /** C4.1 (T3.3) — travels with legacy `knowledgeBase` for NFR8 (1 cycle). */
    knowledgeRouter?: KnowledgeRouterPort;
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
      imageProcessor: new SharpImageProcessor(),
      audioTranscriber: new OpenAiAudioTranscriber(),
      audioStorage: this.buildAudioStorage(),
      tts: deps.tts,
      cache: deps.cache,
      ocr: deps.ocr,
      audit: auditService,
      userMemory: deps.userMemory,
      knowledgeBase: deps.knowledgeBase,
      knowledgeRouter: deps.knowledgeRouter,
      imageEnrichment: deps.imageEnrichment,
      webSearch: deps.webSearch,
      artTopicClassifier: new ArtTopicClassifier(),
      advancedGuardrail: this.buildAdvancedGuardrail(),
      advancedGuardrailObserveOnly: env.guardrails.observeOnly,
      // F4 (2026-04-30) — bind the judge to the live orchestrator. Disabled
      // unless `GUARDRAILS_V2_CANDIDATE=llm-judge` so the noop path stays cost-free.
      llmJudgeEnabled: env.guardrails.candidate === 'llm-judge',
      llmJudge: async (message: string) =>
        await judgeWithLlm(message, { orchestrator: deps.effectiveOrchestrator }),
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
