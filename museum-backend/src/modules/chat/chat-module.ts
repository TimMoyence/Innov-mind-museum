import { OpenAiAudioTranscriber } from '@modules/chat/adapters/secondary/audio/audio-transcriber.openai';
import {
  OpenAiTextToSpeechService,
  DisabledTextToSpeechService,
} from '@modules/chat/adapters/secondary/audio/text-to-speech.openai';
import { createEmbeddingsAdapter } from '@modules/chat/adapters/secondary/embeddings/embeddings.factory';
import { SharpImageProcessor } from '@modules/chat/adapters/secondary/image/image-processing.service';
import {
  TesseractOcrService,
  type DisabledOcrService,
} from '@modules/chat/adapters/secondary/image/ocr-service';
import { toModel } from '@modules/chat/adapters/secondary/llm/langchain-orchestrator-support';
import { LangChainChatOrchestrator } from '@modules/chat/adapters/secondary/llm/langchain.orchestrator';
import { LlmCostCircuitBreaker } from '@modules/chat/adapters/secondary/llm/llm-cost-circuit-breaker';
import { TypeOrmArtKeywordRepository } from '@modules/chat/adapters/secondary/persistence/artKeyword.repository.typeorm';
import { ArtworkEmbeddingRepositoryPg } from '@modules/chat/adapters/secondary/persistence/artwork-embedding.repository.pg';
import { TypeOrmChatRepository } from '@modules/chat/adapters/secondary/persistence/chat.repository.typeorm';
import { TypeOrmUserMemoryRepository } from '@modules/chat/adapters/secondary/persistence/userMemory.repository.typeorm';
import { WikidataKbDumpRepositoryTypeOrm } from '@modules/chat/adapters/secondary/persistence/wikidata-kb-dump.repository.typeorm';
import { createRerankerAdapter } from '@modules/chat/adapters/secondary/rerank/reranker.factory';
import { BraveSearchClient } from '@modules/chat/adapters/secondary/search/brave-search.client';
import { DuckDuckGoClient } from '@modules/chat/adapters/secondary/search/duckduckgo.client';
import { FallbackSearchProvider } from '@modules/chat/adapters/secondary/search/fallback-search.provider';
import { GoogleCseClient } from '@modules/chat/adapters/secondary/search/google-cse.client';
import { MusaiumCatalogueClient } from '@modules/chat/adapters/secondary/search/musaium-catalogue.client';
import { SearxngClient } from '@modules/chat/adapters/secondary/search/searxng.client';
import { TavilyClient } from '@modules/chat/adapters/secondary/search/tavily.client';
import { UnsplashClient } from '@modules/chat/adapters/secondary/search/unsplash.client';
import { WikidataBreakerClient } from '@modules/chat/adapters/secondary/search/wikidata-breaker';
import { WikidataWriteThroughProvider } from '@modules/chat/adapters/secondary/search/wikidata-write-through.provider';
import { WikidataClient } from '@modules/chat/adapters/secondary/search/wikidata.client';
import { WikimediaCommonsClient } from '@modules/chat/adapters/secondary/search/wikimedia-commons.client';
import { S3CompatibleAudioStorage } from '@modules/chat/adapters/secondary/storage/audio-storage.s3';
import { LocalAudioStorage } from '@modules/chat/adapters/secondary/storage/audio-storage.stub';
import { S3CompatibleImageStorage } from '@modules/chat/adapters/secondary/storage/image-storage.s3';
import { LocalImageStorage } from '@modules/chat/adapters/secondary/storage/image-storage.stub';
import {
  GetMessageExplanationUseCase,
  TypeOrmAuditCorrelator,
} from '@modules/chat/useCase/explanation/get-message-explanation.use-case';
import { configureGuardrailBudget } from '@modules/chat/useCase/guardrail/guardrail-budget';
import {
  armCoolDown as frictionArmCoolDown,
  configureGuardrailFriction,
  frictionCount,
  isCoolingDown as frictionIsCoolingDown,
  recordStrike as frictionRecordStrike,
  resetFriction,
  type IGuardrailFrictionStore,
} from '@modules/chat/useCase/guardrail/guardrail-friction.store';
import { ImageEnrichmentService } from '@modules/chat/useCase/image/image-enrichment.service';
import { ImageProcessingService as ImageProcessingPipelineService } from '@modules/chat/useCase/image/image-processing.service';
import { KnowledgeBaseService } from '@modules/chat/useCase/knowledge/knowledge-base.service';
import { KnowledgeRouterService } from '@modules/chat/useCase/knowledge/knowledge-router.service';
import { judgeWithLlm, LlmJudgeGuardrail } from '@modules/chat/useCase/llm/llm-judge-guardrail';
import { LocationResolver } from '@modules/chat/useCase/location-resolver';
import { UserMemoryService } from '@modules/chat/useCase/memory/user-memory.service';
import { configureIdempotency } from '@modules/chat/useCase/message/idempotency.store';
import { ChatService } from '@modules/chat/useCase/orchestration/chat.service';
import { ensureSessionAccess } from '@modules/chat/useCase/session/session-access';
import { UpdateSessionContextUseCase } from '@modules/chat/useCase/session/update-session-context.useCase';
import { buildThirdPartyAiConsentChecker } from '@modules/chat/useCase/third-party-ai-consent-checker';
import { compareImageUseCase as createCompareImageUseCase } from '@modules/chat/useCase/visual-similarity/compare.use-case';
import { VisualSimilarityService } from '@modules/chat/useCase/visual-similarity/similarity.service';
import { WikidataEnricher } from '@modules/chat/useCase/visual-similarity/wikidata-enricher';
import { WebSearchService } from '@modules/chat/useCase/web-search/web-search.service';
import { KnowledgeExtractionModule } from '@modules/knowledge-extraction/index';
import { auditService } from '@shared/audit';
import { NoopCacheService } from '@shared/cache/noop-cache.service';
import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';
import { fireAndForget } from '@shared/utils/fire-and-forget';
import { env } from '@src/config/env';

import type { ChatModel } from '@modules/chat/adapters/secondary/llm/langchain-orchestrator-support';
import type { ArtKeywordRepository } from '@modules/chat/domain/art-keyword/artKeyword.repository.interface';
import type { AudioStorage } from '@modules/chat/domain/ports/audio-storage.port';
import type { ChatOrchestrator } from '@modules/chat/domain/ports/chat-orchestrator.port';
import type { ImageStorage } from '@modules/chat/domain/ports/image-storage.port';
import type { KnowledgeBaseProvider } from '@modules/chat/domain/ports/knowledge-base.port';
import type { OcrService } from '@modules/chat/domain/ports/ocr.port';
import type { WebSearchProvider } from '@modules/chat/domain/ports/web-search.port';
import type { CompareResult } from '@modules/chat/domain/visual-similarity/compare-result.types';
import type { KnowledgeRouterPort } from '@modules/chat/useCase/knowledge/knowledge-router.service';
import type { LocationConsentChecker } from '@modules/chat/useCase/location-resolver';
import type { ThirdPartyAiConsentChecker } from '@modules/chat/useCase/third-party-ai-consent-checker';
import type {
  ChatPersistencePort,
  CompareMimeType,
  CompareUseCaseInput,
  ImageProcessorPort as CompareImageProcessorPort,
} from '@modules/chat/useCase/visual-similarity/compare.use-case';
import type { ArtworkKnowledgeRepoPort } from '@modules/knowledge-extraction/domain/ports/artwork-knowledge-repo.port';
import type { BuiltKnowledgeExtractionModule } from '@modules/knowledge-extraction/index';
import type { IMuseumRepository } from '@modules/museum/domain/museum/museum.repository.interface';
import type { CacheService } from '@shared/cache/cache.port';
import type { DataSource } from 'typeorm';

export interface BuiltChatModule {
  chatService: ChatService;
  imageStorage: ImageStorage;
  audioStorage: AudioStorage | undefined;
  repository: TypeOrmChatRepository;
  ocrService: OcrService;
  userMemoryService: UserMemoryService | undefined;
  artKeywordRepository: ArtKeywordRepository;
  artworkKnowledgeRepo?: ArtworkKnowledgeRepoPort;
  compareImageUseCase?: (input: CompareUseCaseInput) => Promise<CompareResult>;
  compareSessionAccessVerifier?: (
    sessionId: string,
    ownerId: number | undefined,
  ) => Promise<{ museumId: number | null }>;
  knowledgeRouter?: KnowledgeRouterPort;
  getMessageExplanationUseCase: GetMessageExplanationUseCase;
  updateSessionContextUseCase: UpdateSessionContextUseCase;
}

interface WikidataStack {
  readonly kbProvider: KnowledgeBaseProvider;
  readonly knowledgeBase: KnowledgeBaseService;
  readonly wikidataBreaker: WikidataBreakerClient;
}

function buildWikidataStack(dataSource: DataSource, cache?: CacheService): WikidataStack {
  const wikidataClient = new WikidataClient({ userAgent: env.wikidata.userAgent });
  const wikidataBreaker = new WikidataBreakerClient(wikidataClient, env.knowledgeBase.breaker);
  const wikidataDumpRepo = new WikidataKbDumpRepositoryTypeOrm(dataSource);
  const kbProvider = new WikidataWriteThroughProvider(wikidataBreaker, wikidataDumpRepo);
  const { timeoutMs, cacheTtlSeconds, cacheMaxEntries, localDumpFallbackAfterMs } =
    env.knowledgeBase;
  const knowledgeBase = new KnowledgeBaseService(
    kbProvider,
    { timeoutMs, cacheTtlSeconds, cacheMaxEntries, localDumpFallbackAfterMs },
    cache,
    {
      breakerState: () => wikidataBreaker.getState(),
      dumpRepo: wikidataDumpRepo,
    },
  );
  return { kbProvider, knowledgeBase, wikidataBreaker };
}

function buildKnowledgeRouter(
  kbProvider: KnowledgeBaseProvider,
  wsProvider: WebSearchProvider,
  judgeModel: ChatModel | null,
): KnowledgeRouterService {
  return new KnowledgeRouterService({
    kb: kbProvider,
    ws: wsProvider,
    judge: new LlmJudgeGuardrail({ model: judgeModel }),
    reranker: createRerankerAdapter(env),
    config: {
      threshold: env.knowledgeRouter.threshold,
      kbTimeoutMs: env.knowledgeRouter.kbTimeoutMs,
      judgeTimeoutMs: env.knowledgeRouter.judgeTimeoutMs,
      wsTimeoutMs: env.knowledgeRouter.wsTimeoutMs,
      rerankTimeoutMs: env.rerank.timeoutMs,
    },
  });
}

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
        { skipStorage: true },
      );
      const orchImage = processed.orchestratorImage;
      const cleanedBuffer = Buffer.from(orchImage.value, 'base64');
      const cleanedMime: CompareMimeType =
        (orchImage.mimeType as CompareMimeType | undefined) ?? inputMime;
      return { buffer: cleanedBuffer, mimeType: cleanedMime };
    },
  };
}

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

function buildCompareImageUseCase(
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

  const rerankerAdapter = createRerankerAdapter(env);

  const visualSimilarityService = new VisualSimilarityService({
    encoder: embeddingsAdapter,
    repo: artworkEmbeddingRepo,
    enricher: wikidataEnricher,
    cache: cacheBackend,
    reranker: rerankerAdapter,
    weights: {
      wVisual: env.visualSimilarity.wVisual,
      wMeta: env.visualSimilarity.wMeta,
    },
    topN: env.visualSimilarity.topN,
    topK: env.visualSimilarity.topKDefault,
    rerankTimeoutMs: env.rerank.timeoutMs,
    fallbackVisualThreshold: env.visualSimilarity.fallbackVisualThreshold,
  });

  return createCompareImageUseCase({
    imageProcessor: buildCompareImageProcessor(imageStorage, ocr),
    similarityService: visualSimilarityService,
    chatService: buildCompareChatPersistence(repository),
  });
}

function buildCompareSessionAccessVerifier(
  repository: TypeOrmChatRepository,
): (sessionId: string, ownerId: number | undefined) => Promise<{ museumId: number | null }> {
  return async (sessionId, ownerId) => {
    const session = await ensureSessionAccess(sessionId, repository, ownerId);
    return { museumId: session.museumId ?? null };
  };
}

export class ChatModule {
  private _built: BuiltChatModule | undefined;
  private _orchestrator: LangChainChatOrchestrator | undefined;
  private _llmCostCircuitBreaker: LlmCostCircuitBreaker | undefined;
  private _artKeywordsRefreshTimer: ReturnType<typeof setInterval> | undefined;
  private _knowledgeExtractionClose: (() => Promise<void>) | undefined;
  private _wikidataBreaker: WikidataBreakerClient | undefined;

  isBuilt(): boolean {
    return this._built !== undefined;
  }

  getBuilt(): BuiltChatModule {
    if (!this._built) {
      throw new Error('ChatModule.build() must be called before accessing services');
    }
    return this._built;
  }

  getLlmCircuitBreakerState():
    | { state: 'CLOSED' | 'OPEN' | 'HALF_OPEN'; failureCount: number; lastFailureAt: Date | null }
    | undefined {
    return this._orchestrator?.getCircuitBreakerState();
  }

  getLlmCostCircuitBreaker(): LlmCostCircuitBreaker | undefined {
    return this._llmCostCircuitBreaker;
  }

  stopArtKeywordsRefresh(): void {
    if (this._artKeywordsRefreshTimer) {
      clearInterval(this._artKeywordsRefreshTimer);
      this._artKeywordsRefreshTimer = undefined;
    }
  }

  async stopKnowledgeExtraction(): Promise<void> {
    await this._knowledgeExtractionClose?.();
  }

  stopWikidataBreaker(): void {
    this._wikidataBreaker?.dispose();
  }

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

  private buildKnowledgeExtraction(dataSource: DataSource): BuiltKnowledgeExtractionModule {
    return new KnowledgeExtractionModule().build(dataSource);
  }

  private buildWebSearch(cache?: CacheService): {
    service: WebSearchService;
    provider: WebSearchProvider;
  } {
    const providers: WebSearchProvider[] = [];

    if (env.webSearch.tavilyApiKey) {
      providers.push(new TavilyClient(env.webSearch.tavilyApiKey));
    }
    if (env.webSearch.braveSearchApiKey) {
      providers.push(new BraveSearchClient(env.webSearch.braveSearchApiKey));
    }
    if (env.webSearch.googleCseApiKey && env.webSearch.googleCseId) {
      providers.push(
        new GoogleCseClient({
          apiKey: env.webSearch.googleCseApiKey,
          cseId: env.webSearch.googleCseId,
        }),
      );
    }
    const searxngInstances = env.webSearch.searxngInstances ?? [];
    if (searxngInstances.length > 0) {
      providers.push(new SearxngClient(searxngInstances));
    }
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
          error: errorMessage(error),
        });
      }
    };

    void refreshKeywords();
    const timer = setInterval(() => void refreshKeywords(), 5 * 60 * 1000);
    timer.unref();
    this._artKeywordsRefreshTimer = timer;

    const onArtKeywordDiscovered = (keyword: string, locale: string) => {
      const normalized = keyword.toLowerCase().trim();
      if (!normalized || dynamicArtKeywords.has(normalized)) return;
      dynamicArtKeywords.add(normalized);
      fireAndForget(artKeywordRepo.upsert(normalized, locale), 'art_keyword_upsert');
    };

    return { dynamicArtKeywords, onArtKeywordDiscovered };
  }

  build(
    dataSource: DataSource,
    cache?: CacheService,
    museumRepository?: IMuseumRepository,
  ): BuiltChatModule {
    const imageStorage = this.buildImageStorage();
    const audioStorage = this.buildAudioStorage();
    const repository = new TypeOrmChatRepository(dataSource);

    this._llmCostCircuitBreaker = new LlmCostCircuitBreaker({
      hourlyThresholdCents: env.guardrails.costCircuitBreaker.hourlyThresholdCents,
      dailyBudgetCents: env.guardrails.costCircuitBreaker.dailyBudgetCents,
      openDurationMs: env.guardrails.costCircuitBreaker.openDurationMs,
    });

    const tts = env.llm.openAiApiKey
      ? new OpenAiTextToSpeechService(this._llmCostCircuitBreaker)
      : new DisabledTextToSpeechService();
    const ocr = new TesseractOcrService();
    const { kbProvider, knowledgeBase, wikidataBreaker } = buildWikidataStack(dataSource, cache);
    this._wikidataBreaker = wikidataBreaker;
    const imageEnrichment = this.buildImageEnrichment();
    const { service: webSearch, provider: wsProvider } = this.buildWebSearch(cache);

    const artKeywordRepo = new TypeOrmArtKeywordRepository(dataSource);
    this.buildArtKeywordRefresh(artKeywordRepo);

    const llmModel = toModel();
    const orchestrator = new LangChainChatOrchestrator({
      model: llmModel,
      costBreaker: this._llmCostCircuitBreaker,
    });
    this._orchestrator = orchestrator;
    const effectiveOrchestrator: ChatOrchestrator = orchestrator;
    configureGuardrailBudget({ cache });
    configureGuardrailFriction({ cache });
    configureIdempotency({ cache });
    const frictionStore: IGuardrailFrictionStore = {
      recordStrike: frictionRecordStrike,
      count: frictionCount,
      armCoolDown: frictionArmCoolDown,
      isCoolingDown: frictionIsCoolingDown,
      reset: resetFriction,
    };

    const knowledgeRouter = buildKnowledgeRouter(kbProvider, wsProvider, llmModel);
    const locationResolver = museumRepository
      ? new LocationResolver(museumRepository, cache)
      : undefined;
    const locationConsentChecker = buildLocationConsentChecker();
    const thirdPartyAiConsentChecker = buildThirdPartyAiConsentChecker();

    const knowledgeExtraction = this.buildKnowledgeExtraction(dataSource);
    this._knowledgeExtractionClose = knowledgeExtraction.close;

    const userMemory = this.buildUserMemory(
      dataSource,
      cache,
      knowledgeExtraction.artworkKnowledgeRepo,
    );

    const chatService = this.buildChatService({
      repository,
      effectiveOrchestrator,
      judgeModel: llmModel,
      imageStorage,
      audioStorage,
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
      thirdPartyAiConsentChecker,
      knowledgeExtraction,
      artworkKnowledgeRepo: knowledgeExtraction.artworkKnowledgeRepo,
      frictionStore,
    });

    const compareImageUseCase = buildCompareImageUseCase(
      repository,
      dataSource,
      imageStorage,
      ocr,
      cache,
    );
    const compareSessionAccessVerifier = buildCompareSessionAccessVerifier(repository);

    const getMessageExplanationUseCase = new GetMessageExplanationUseCase({
      repository,
      auditCorrelator: new TypeOrmAuditCorrelator(dataSource),
    });

    const updateSessionContextUseCase = new UpdateSessionContextUseCase(repository);

    const built: BuiltChatModule = {
      chatService,
      imageStorage,
      audioStorage,
      repository,
      ocrService: ocr,
      userMemoryService: userMemory,
      artKeywordRepository: artKeywordRepo,
      artworkKnowledgeRepo: knowledgeExtraction.artworkKnowledgeRepo,
      compareImageUseCase,
      compareSessionAccessVerifier,
      knowledgeRouter,
      getMessageExplanationUseCase,
      updateSessionContextUseCase,
    };
    this._built = built;
    return built;
  }

  private buildChatService(deps: {
    repository: TypeOrmChatRepository;
    effectiveOrchestrator: ChatOrchestrator;
    judgeModel: ChatModel | null;
    imageStorage: LocalImageStorage | S3CompatibleImageStorage;
    audioStorage: AudioStorage | undefined;
    tts: OpenAiTextToSpeechService | DisabledTextToSpeechService;
    cache?: CacheService;
    ocr: TesseractOcrService | DisabledOcrService;
    userMemory?: UserMemoryService;
    knowledgeBase?: KnowledgeBaseService;
    knowledgeRouter?: KnowledgeRouterPort;
    imageEnrichment?: ImageEnrichmentService;
    webSearch?: WebSearchService;
    museumRepository?: IMuseumRepository;
    locationResolver?: LocationResolver;
    locationConsentChecker?: LocationConsentChecker;
    thirdPartyAiConsentChecker?: ThirdPartyAiConsentChecker;
    knowledgeExtraction: ReturnType<ChatModule['buildKnowledgeExtraction']>;
    artworkKnowledgeRepo?: ArtworkKnowledgeRepoPort;
    frictionStore: IGuardrailFrictionStore;
  }): ChatService {
    return new ChatService({
      repository: deps.repository,
      orchestrator: deps.effectiveOrchestrator,
      imageStorage: deps.imageStorage,
      imageProcessor: new SharpImageProcessor(),
      audioTranscriber: new OpenAiAudioTranscriber(this._llmCostCircuitBreaker),
      audioStorage: deps.audioStorage,
      tts: deps.tts,
      cache: deps.cache,
      ocr: deps.ocr,
      audit: auditService,
      userMemory: deps.userMemory,
      knowledgeBase: deps.knowledgeBase,
      knowledgeRouter: deps.knowledgeRouter,
      imageEnrichment: deps.imageEnrichment,
      webSearch: deps.webSearch,
      llmJudgeEnabled: env.guardrails.budgetCentsPerDay > 0,
      frictionStore: deps.frictionStore,
      llmJudge: async (message: string, scope?) =>
        await judgeWithLlm(message, {
          model: deps.judgeModel ?? undefined,
          ...(scope?.museumId !== undefined ? { museumId: scope.museumId } : {}),
          ...(scope?.tier !== undefined ? { tier: scope.tier } : {}),
          ...(scope?.requestId !== undefined ? { requestId: scope.requestId } : {}),
        }),
      museumRepository: deps.museumRepository,
      dbLookup: deps.knowledgeExtraction.dbLookup,
      extractionQueue: deps.knowledgeExtraction.extractionQueue,
      locationResolver: deps.locationResolver,
      locationConsentChecker: deps.locationConsentChecker,
      thirdPartyAiConsentChecker: deps.thirdPartyAiConsentChecker,
      artworkKnowledgeRepo: deps.artworkKnowledgeRepo,
    });
  }
}

function buildLocationConsentChecker(): LocationConsentChecker {
  return {
    async isGranted(
      userId: number,
      scope: 'location_to_llm' | 'location_coarse_to_llm',
    ): Promise<boolean> {
      const { userConsentRepository } = await import('@modules/auth/useCase');
      return await userConsentRepository.isGranted(userId, scope);
    },
  };
}

let active: ChatModule = new ChatModule();

export const getActiveChatModule = (): ChatModule => active;

export const setActiveChatModule = (next: ChatModule): void => {
  active = next;
};

export const resetActiveChatModule = (): void => {
  active = new ChatModule();
};

export const getImageStorage = (): ImageStorage => getActiveChatModule().getBuilt().imageStorage;

export const getAudioStorage = (): AudioStorage | undefined =>
  getActiveChatModule().getBuilt().audioStorage;

export const getChatRepository = (): TypeOrmChatRepository =>
  getActiveChatModule().getBuilt().repository;

export const getUserMemoryService = (): UserMemoryService | undefined =>
  getActiveChatModule().isBuilt() ? getActiveChatModule().getBuilt().userMemoryService : undefined;

export const getArtKeywordRepository = (): ArtKeywordRepository | undefined =>
  getActiveChatModule().isBuilt()
    ? getActiveChatModule().getBuilt().artKeywordRepository
    : undefined;

export const getLlmCircuitBreakerState = (): ReturnType<ChatModule['getLlmCircuitBreakerState']> =>
  getActiveChatModule().getLlmCircuitBreakerState();

export const getArtworkKnowledgeRepo = (): ArtworkKnowledgeRepoPort | undefined =>
  getActiveChatModule().isBuilt()
    ? getActiveChatModule().getBuilt().artworkKnowledgeRepo
    : undefined;

export const getCompareImageUseCase = (): BuiltChatModule['compareImageUseCase'] =>
  getActiveChatModule().isBuilt()
    ? getActiveChatModule().getBuilt().compareImageUseCase
    : undefined;

export const getCompareSessionAccessVerifier =
  (): BuiltChatModule['compareSessionAccessVerifier'] =>
    getActiveChatModule().isBuilt()
      ? getActiveChatModule().getBuilt().compareSessionAccessVerifier
      : undefined;

export const getMessageExplanationUseCase = (): GetMessageExplanationUseCase | undefined =>
  getActiveChatModule().isBuilt()
    ? getActiveChatModule().getBuilt().getMessageExplanationUseCase
    : undefined;

export const getUpdateSessionContextUseCase = (): UpdateSessionContextUseCase | undefined =>
  getActiveChatModule().isBuilt()
    ? getActiveChatModule().getBuilt().updateSessionContextUseCase
    : undefined;
