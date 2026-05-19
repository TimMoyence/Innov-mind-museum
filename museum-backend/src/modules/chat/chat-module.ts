/* eslint-disable max-lines -- JUSTIFIED: composition root for the chat module. The previous split across 6 files (chat-module.ts + compare-wiring + knowledge-router-wiring + wikidata-wiring + singleton + wiring.ts, 922L total) existed only to game ESLint max-lines:400; the inline docblocks of those files admitted as much. Reunifying restores ordering invariants in one place. Cf docs/audit-cleanup-2026-05-12/PROMPT_C.md#C.10 */

import { OpenAiAudioTranscriber } from '@modules/chat/adapters/secondary/audio/audio-transcriber.openai';
import {
  OpenAiTextToSpeechService,
  DisabledTextToSpeechService,
} from '@modules/chat/adapters/secondary/audio/text-to-speech.openai';
import { createEmbeddingsAdapter } from '@modules/chat/adapters/secondary/embeddings/embeddings.factory';
import { GuardrailCircuitBreaker } from '@modules/chat/adapters/secondary/guardrails/guardrail-circuit-breaker';
import { LLMGuardAdapter } from '@modules/chat/adapters/secondary/guardrails/llm-guard.adapter';
import { ScanInflightSemaphore } from '@modules/chat/adapters/secondary/guardrails/scan-inflight-semaphore';
import { TenantRateLimiter } from '@modules/chat/adapters/secondary/guardrails/tenant-rate-limiter';
import { SharpImageProcessor } from '@modules/chat/adapters/secondary/image/image-processing.service';
import {
  TesseractOcrService,
  type DisabledOcrService,
} from '@modules/chat/adapters/secondary/image/ocr-service';
import { LangChainChatOrchestrator } from '@modules/chat/adapters/secondary/llm/langchain.orchestrator';
import { LlmCostCircuitBreaker } from '@modules/chat/adapters/secondary/llm/llm-cost-circuit-breaker';
import { TypeOrmArtKeywordRepository } from '@modules/chat/adapters/secondary/persistence/artKeyword.repository.typeorm';
import { ArtworkEmbeddingRepositoryPg } from '@modules/chat/adapters/secondary/persistence/artwork-embedding.repository.pg';
import { TypeOrmChatRepository } from '@modules/chat/adapters/secondary/persistence/chat.repository.typeorm';
import { TypeOrmUserMemoryRepository } from '@modules/chat/adapters/secondary/persistence/userMemory.repository.typeorm';
import { WikidataKbDumpRepositoryTypeOrm } from '@modules/chat/adapters/secondary/persistence/wikidata-kb-dump.repository.typeorm';
import { RegexPiiSanitizer } from '@modules/chat/adapters/secondary/pii/pii-sanitizer.regex';
import { BraveSearchClient } from '@modules/chat/adapters/secondary/search/brave-search.client';
import { DuckDuckGoClient } from '@modules/chat/adapters/secondary/search/duckduckgo.client';
import { FallbackSearchProvider } from '@modules/chat/adapters/secondary/search/fallback-search.provider';
import { GoogleCseClient } from '@modules/chat/adapters/secondary/search/google-cse.client';
import { MusaiumCatalogueClient } from '@modules/chat/adapters/secondary/search/musaium-catalogue.client';
import { SearXNGClient } from '@modules/chat/adapters/secondary/search/searxng.client';
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
import { DescribeService } from '@modules/chat/useCase/describe.service';
import {
  GetMessageExplanationUseCase,
  TypeOrmAuditCorrelator,
} from '@modules/chat/useCase/explanation/get-message-explanation.use-case';
import { ArtTopicClassifier } from '@modules/chat/useCase/guardrail/art-topic-classifier';
import { configureGuardrailBudget } from '@modules/chat/useCase/guardrail/guardrail-budget';
import { ImageEnrichmentService } from '@modules/chat/useCase/image/image-enrichment.service';
import { ImageProcessingService as ImageProcessingPipelineService } from '@modules/chat/useCase/image/image-processing.service';
import { KnowledgeBaseService } from '@modules/chat/useCase/knowledge/knowledge-base.service';
import { KnowledgeRouterService } from '@modules/chat/useCase/knowledge/knowledge-router.service';
import { judgeWithLlm, LlmJudgeGuardrail } from '@modules/chat/useCase/llm/llm-judge-guardrail';
import { LocationResolver } from '@modules/chat/useCase/location-resolver';
import { UserMemoryService } from '@modules/chat/useCase/memory/user-memory.service';
import { ChatService } from '@modules/chat/useCase/orchestration/chat.service';
import { ensureSessionAccess } from '@modules/chat/useCase/session/session-access';
import { UpdateSessionContextUseCase } from '@modules/chat/useCase/session/update-session-context.useCase';
import { compareImageUseCase as createCompareImageUseCase } from '@modules/chat/useCase/visual-similarity/compare.use-case';
import { VisualSimilarityService } from '@modules/chat/useCase/visual-similarity/similarity.service';
import { WikidataEnricher } from '@modules/chat/useCase/visual-similarity/wikidata-enricher';
import { WebSearchService } from '@modules/chat/useCase/web-search/web-search.service';
import { KnowledgeExtractionModule } from '@modules/knowledge-extraction/index';
import { auditService } from '@shared/audit';
import { AUDIT_SECURITY_LLM_GUARD_BREAKER_OPEN } from '@shared/audit/audit.types';
import { NoopCacheService } from '@shared/cache/noop-cache.service';
import { logger } from '@shared/logger/logger';
import {
  llmCostCircuitBreakerState,
  llmCostCircuitBreakerTripsTotal,
  llmGuardCircuitBreakerState,
  llmGuardCircuitBreakerTripsTotal,
  tenantRateLimitRejectsTotal,
} from '@shared/observability/prometheus-metrics';
import { fireAndForget } from '@shared/utils/fire-and-forget';
import { env } from '@src/config/env';

import type { ArtKeywordRepository } from '@modules/chat/domain/art-keyword/artKeyword.repository.interface';
import type { AudioStorage } from '@modules/chat/domain/ports/audio-storage.port';
import type { ChatOrchestrator } from '@modules/chat/domain/ports/chat-orchestrator.port';
import type { GuardrailProvider } from '@modules/chat/domain/ports/guardrail-provider.port';
import type { ImageStorage } from '@modules/chat/domain/ports/image-storage.port';
import type { KnowledgeBaseProvider } from '@modules/chat/domain/ports/knowledge-base.port';
import type { OcrService } from '@modules/chat/domain/ports/ocr.port';
import type { WebSearchProvider } from '@modules/chat/domain/ports/web-search.port';
import type { CompareResult } from '@modules/chat/domain/visual-similarity/compare-result.types';
import type { KnowledgeRouterPort } from '@modules/chat/useCase/knowledge/knowledge-router.service';
import type { LocationConsentChecker } from '@modules/chat/useCase/location-resolver';
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
  describeService: DescribeService;
  imageStorage: ImageStorage;
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
  /**
   * GDPR Art. 22 + AI Act Art. 14 — read-only use-case for
   * `GET /api/chat/messages/:id/explanation`. See `docs/GDPR_ART22_SCOPE.md`.
   */
  getMessageExplanationUseCase: GetMessageExplanationUseCase;
  /**
   * W3 (T5.3) — patch `current_artwork_id` / `current_room` on a session.
   * Consumed by `PATCH /api/chat/sessions/:id/context`.
   */
  updateSessionContextUseCase: UpdateSessionContextUseCase;
}

// Wikidata stack — composition (outer → inner):
//   WikidataWriteThroughProvider  ← C5.3 fire-and-forget UPSERT into dump
//     └─ WikidataBreakerClient    ← C5.1 opossum CB + null fallback
//          └─ WikidataClient      ← raw HTTP / SPARQL
// Both KnowledgeBaseService AND KnowledgeRouterService share the same kbProvider
// reference so breaker state + dump write-through are shared. Pre-launch V1
// doctrine: no `*_ENABLED` flag, rollback = `git revert` of the wiring.

interface WikidataStack {
  readonly kbProvider: KnowledgeBaseProvider;
  readonly knowledgeBase: KnowledgeBaseService;
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
  return { kbProvider, knowledgeBase };
}

// C4.1 KnowledgeRouterService cascade: KB → LLM judge → WebSearch. Per-leg
// budgets sourced from `env.knowledgeRouter.*` — TUNING-ONLY (D11 / pre-launch
// V1), NO `*_ENABLED` switch.

function buildKnowledgeRouter(
  kbProvider: KnowledgeBaseProvider,
  wsProvider: WebSearchProvider,
  orchestrator: ChatOrchestrator,
): KnowledgeRouterService {
  return new KnowledgeRouterService({
    kb: kbProvider,
    ws: wsProvider,
    judge: new LlmJudgeGuardrail({ orchestrator }),
    config: {
      threshold: env.knowledgeRouter.threshold,
      kbTimeoutMs: env.knowledgeRouter.kbTimeoutMs,
      judgeTimeoutMs: env.knowledgeRouter.judgeTimeoutMs,
      wsTimeoutMs: env.knowledgeRouter.wsTimeoutMs,
    },
  });
}

// C3 Visual Similarity — composition root for `POST /chat/compare`.
// See `compare.use-case.ts` for the orchestration contract.

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

function buildCompareSessionAccessVerifier(
  repository: TypeOrmChatRepository,
): (sessionId: string, ownerId: number | undefined) => Promise<{ museumId: number | null }> {
  return async (sessionId, ownerId) => {
    // `ensureSessionAccess` already runs the UUID + lookup + ownership
    // invariants; returning the loaded session lets us forward its tenant
    // scope to the route without a second round-trip (OWASP LLM08).
    const session = await ensureSessionAccess(sessionId, repository, ownerId);
    return { museumId: session.museumId ?? null };
  };
}

/**
 * Encapsulates the chat module dependency graph and lifecycle.
 * Call {@link build} to wire dependencies; access via {@link getBuilt}.
 */
export class ChatModule {
  private _built: BuiltChatModule | undefined;
  private _orchestrator: LangChainChatOrchestrator | undefined;
  private _guardrailCircuitBreaker: GuardrailCircuitBreaker | undefined;
  /**
   * Scalability primitives (perennial design §11). Cost breaker is
   * process-scoped (in-memory rolling window). Tenant rate limiter is built but
   * NOT wired V1 — Phase 2 (B2B onset) consumes it from the chat use-case.
   */
  private _llmCostCircuitBreaker: LlmCostCircuitBreaker | undefined;
  private _tenantRateLimiter: TenantRateLimiter | undefined;
  /**
   * Single-instance reference so health probe + use-case target the SAME
   * adapter — local metrics counters would dilute if we instantiated twice.
   */
  private _guardrailProvider: GuardrailProvider | undefined;
  private _artKeywordsRefreshTimer: ReturnType<typeof setInterval> | undefined;
  private _knowledgeExtractionClose: (() => Promise<void>) | undefined;

  isBuilt(): boolean {
    return this._built !== undefined;
  }

  /** @throws {Error} if {@link build} hasn't been called. */
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

  /** Mirrors `getLlmCircuitBreakerState()` shape so /api/health stays uniform (R8). */
  getLlmGuardCircuitBreakerState():
    | {
        state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
        failureCount: number;
        lastFailureAt: Date | null;
        openedAt: Date | null;
      }
    | undefined {
    return this._guardrailCircuitBreaker?.getState();
  }

  /** Perennial §11 D9. */
  getLlmCostCircuitBreaker(): LlmCostCircuitBreaker | undefined {
    return this._llmCostCircuitBreaker;
  }

  /** Perennial §11 D10. NOT wired V1 (single B2C tenant); ready Phase 2. */
  getTenantRateLimiter(): TenantRateLimiter | undefined {
    return this._tenantRateLimiter;
  }

  /**
   * Returns `undefined` when `GUARDRAILS_V2_LLM_GUARD_URL` unset or module not
   * built. Consumed by `/api/health/deep` for semantic probe (Phase 1).
   */
  getGuardrailProvider(): GuardrailProvider | undefined {
    return this._guardrailProvider;
  }

  /**
   * Lazy + cached so `/api/health/deep` accessor and chat hot path share ONE
   * adapter — local counters + breaker reference would diverge otherwise.
   */
  private getOrBuildGuardrailProvider(): GuardrailProvider | undefined {
    this._guardrailProvider ??= this.buildGuardrailProvider();
    return this._guardrailProvider;
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

  /** ADR-048; ADR-015 amendment 2026-05-14. Active when GUARDRAILS_V2_LLM_GUARD_URL set. */
  private buildGuardrailProvider(): GuardrailProvider | undefined {
    const baseUrl = env.guardrails.llmGuardUrl;
    if (!baseUrl) return undefined;

    // Single breaker per process — shared between input + output scan paths so
    // a sidecar degradation trips ONE breaker, not two unsynchronised ones.
    // Metrics wired here via onStateChange so the breaker primitive stays
    // Prometheus-free.
    const breaker = new GuardrailCircuitBreaker({
      failureThreshold: env.guardrails.circuitBreaker.failureThreshold,
      windowMs: env.guardrails.circuitBreaker.windowMs,
      openDurationMs: env.guardrails.circuitBreaker.openDurationMs,
      halfOpenMaxProbes: env.guardrails.circuitBreaker.halfOpenMaxProbes,
      onStateChange: (next) => {
        const nextLabel = next.toLowerCase();
        for (const label of ['closed', 'half_open', 'open']) {
          llmGuardCircuitBreakerState.set({ state: label }, label === nextLabel ? 1 : 0);
        }
        if (next === 'OPEN') {
          llmGuardCircuitBreakerTripsTotal.inc();
          const snapshot = breaker.getState();
          // Audit trail (ADR-047 R6) — no PII, metadata only.
          fireAndForget(
            auditService.log({
              action: AUDIT_SECURITY_LLM_GUARD_BREAKER_OPEN,
              actorType: 'system',
              metadata: {
                failureCount: snapshot.failureCount,
                windowMs: env.guardrails.circuitBreaker.windowMs,
                openedAt: snapshot.openedAt?.toISOString() ?? null,
                // ADR-048 Phase 0 anchor — stable literal until per-tenant
                // policy resolver (Phase 2). Anchors forensic replay across
                // schema evolution.
                policyVersion: 'default-v0',
              },
            }),
            'llm_guard_breaker_open_audit',
          );
        }
      },
    });
    this._guardrailCircuitBreaker = breaker;

    // Seed gauges so dashboards see CLOSED before the first transition
    // (onStateChange only fires on transitions, not construction).
    llmGuardCircuitBreakerState.set({ state: 'closed' }, 1);
    llmGuardCircuitBreakerState.set({ state: 'half_open' }, 0);
    llmGuardCircuitBreakerState.set({ state: 'open' }, 0);

    // Single semaphore per process — shared across input + output legs so the
    // concurrency cap matches actual sidecar fan-out.
    const semaphore = new ScanInflightSemaphore(
      env.guardrails.maxInflight,
      env.guardrails.queueMax,
    );

    return new LLMGuardAdapter({
      baseUrl,
      timeoutMs: env.guardrails.timeoutMs,
      circuitBreaker: breaker,
      semaphore,
      chaosRate: env.guardrails.chaosRate,
    });
  }

  /** Always active in V1. */
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

  /** Shared with `KnowledgeRouterService` (T3.3). DuckDuckGo always last-resort. */
  private buildWebSearch(cache?: CacheService): {
    service: WebSearchService;
    provider: WebSearchProvider;
  } {
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
          error: error instanceof Error ? error.message : String(error),
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

  // eslint-disable-next-line max-lines-per-function -- Justification: composition root that intentionally wires every dependency in one place; ordering invariants documented inline (artKeyword → orchestrator → guardrail-budget → userMemory). Approved-by: tim@2026-05-05
  build(
    dataSource: DataSource,
    cache?: CacheService,
    museumRepository?: IMuseumRepository,
  ): BuiltChatModule {
    const imageStorage = this.buildImageStorage();
    const repository = new TypeOrmChatRepository(dataSource);
    const tts = env.llm.openAiApiKey
      ? new OpenAiTextToSpeechService()
      : new DisabledTextToSpeechService();
    const ocr = new TesseractOcrService();
    const { kbProvider, knowledgeBase } = buildWikidataStack(dataSource, cache);
    const imageEnrichment = this.buildImageEnrichment();
    const { service: webSearch, provider: wsProvider } = this.buildWebSearch(cache);

    const artKeywordRepo = new TypeOrmArtKeywordRepository(dataSource);
    this.buildArtKeywordRefresh(artKeywordRepo);

    const orchestrator = new LangChainChatOrchestrator();
    this._orchestrator = orchestrator;
    const effectiveOrchestrator: ChatOrchestrator = orchestrator;
    configureGuardrailBudget({ cache });

    // Scalability primitives (perennial design §11, 100k clients prep).
    // Cost breaker = singleton because its rolling window MUST be shared by
    // every LLM call site (per-callsite breaker would miss system-wide spikes).
    // Tenant rate limiter singleton for the same fairness reason.
    this._llmCostCircuitBreaker = new LlmCostCircuitBreaker({
      hourlyThresholdCents: env.guardrails.costCircuitBreaker.hourlyThresholdCents,
      dailyBudgetCents: env.guardrails.costCircuitBreaker.dailyBudgetCents,
      openDurationMs: env.guardrails.costCircuitBreaker.openDurationMs,
      onStateChange: (next) => {
        const nextLabel = next.toLowerCase();
        for (const label of ['closed', 'half_open', 'open']) {
          llmCostCircuitBreakerState.set({ state: label }, label === nextLabel ? 1 : 0);
        }
        if (next === 'OPEN') {
          llmCostCircuitBreakerTripsTotal.inc();
        }
      },
    });
    // Seed gauges so dashboards see CLOSED before the first transition.
    llmCostCircuitBreakerState.set({ state: 'closed' }, 1);
    llmCostCircuitBreakerState.set({ state: 'half_open' }, 0);
    llmCostCircuitBreakerState.set({ state: 'open' }, 0);

    this._tenantRateLimiter = new TenantRateLimiter({
      capacity: env.guardrails.tenantRateLimit.capacity,
      refillPerSecond: env.guardrails.tenantRateLimit.refillPerSecond,
      onReject: (tenantId) => {
        tenantRateLimitRejectsTotal.inc({ tenant_id: tenantId });
      },
    });

    const knowledgeRouter = buildKnowledgeRouter(kbProvider, wsProvider, effectiveOrchestrator);
    const locationResolver = museumRepository
      ? new LocationResolver(museumRepository, cache)
      : undefined;
    const locationConsentChecker = buildLocationConsentChecker();

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
      artworkKnowledgeRepo: knowledgeExtraction.artworkKnowledgeRepo,
    });

    const describeService = new DescribeService({ orchestrator: effectiveOrchestrator, tts });

    const compareImageUseCase = buildCompareImageUseCase(
      repository,
      dataSource,
      imageStorage,
      ocr,
      cache,
    );
    const compareSessionAccessVerifier = buildCompareSessionAccessVerifier(repository);

    // GDPR Art. 22 + AI Act Art. 14 — right-to-explanation. TypeORM-backed
    // audit correlator returns `auditRef` linking to the hash-chained audit row.
    const getMessageExplanationUseCase = new GetMessageExplanationUseCase({
      repository,
      auditCorrelator: new TypeOrmAuditCorrelator(dataSource),
    });

    // W3 (T5.3) — Composed last so it captures the repo we just constructed.
    const updateSessionContextUseCase = new UpdateSessionContextUseCase(repository);

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
      knowledgeRouter,
      getMessageExplanationUseCase,
      updateSessionContextUseCase,
    };
    this._built = built;
    return built;
  }

  /**
   * Extracted from build() to keep the orchestration flow (storage → caches →
   * orchestrator → service) scannable without tripping max-lines-per-function.
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
    knowledgeRouter?: KnowledgeRouterPort;
    imageEnrichment?: ImageEnrichmentService;
    webSearch?: WebSearchService;
    museumRepository?: IMuseumRepository;
    locationResolver?: LocationResolver;
    locationConsentChecker?: LocationConsentChecker;
    knowledgeExtraction: ReturnType<ChatModule['buildKnowledgeExtraction']>;
    /** W3 (T5.4) — passed-through into the message pipeline for [CURRENT ARTWORK]. */
    artworkKnowledgeRepo?: ArtworkKnowledgeRepoPort;
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
      // Share ONE adapter — local `metrics()` counters + breaker reference
      // would diverge across instances.
      guardrailProvider: this.getOrBuildGuardrailProvider(),
      guardrailProviderObserveOnly: env.guardrails.observeOnly,
      llmJudgeEnabled: env.guardrails.budgetCentsPerDay > 0,
      llmJudge: async (message: string) =>
        await judgeWithLlm(message, { orchestrator: deps.effectiveOrchestrator }),
      piiSanitizer: new RegexPiiSanitizer(),
      museumRepository: deps.museumRepository,
      dbLookup: deps.knowledgeExtraction.dbLookup,
      extractionQueue: deps.knowledgeExtraction.extractionQueue,
      locationResolver: deps.locationResolver,
      locationConsentChecker: deps.locationConsentChecker,
      artworkKnowledgeRepo: deps.artworkKnowledgeRepo,
    });
  }
}

/**
 * GDPR consent checker that gates location propagation to the third-party LLM.
 * Lazy-imports auth to avoid a circular init between chat and auth at boot.
 */
function buildLocationConsentChecker(): LocationConsentChecker {
  return {
    async isGranted(userId: number, scope: 'location_to_llm'): Promise<boolean> {
      const { userConsentRepository } = await import('@modules/auth/useCase');
      return await userConsentRepository.isGranted(userId, scope);
    },
  };
}

/**
 * Active chat module. Defaults to a fresh singleton on import so call sites
 * work, but `setActiveChatModule()` lets `createApp()` + tests substitute.
 */
let active: ChatModule = new ChatModule();

export const getActiveChatModule = (): ChatModule => active;

/** Call at boot inside `createApp()` or in tests. */
export const setActiveChatModule = (next: ChatModule): void => {
  active = next;
};

/** For test teardown. */
export const resetActiveChatModule = (): void => {
  active = new ChatModule();
};

// Runtime accessors for lazy access at request time (api.router.ts, auth
// callbacks). For lifecycle management use the main barrel (`@modules/chat`).

export const getImageStorage = (): ImageStorage => getActiveChatModule().getBuilt().imageStorage;

export const getChatRepository = (): TypeOrmChatRepository =>
  getActiveChatModule().getBuilt().repository;

export const getUserMemoryService = (): UserMemoryService | undefined =>
  getActiveChatModule().isBuilt() ? getActiveChatModule().getBuilt().userMemoryService : undefined;

export const getArtKeywordRepository = (): ArtKeywordRepository | undefined =>
  getActiveChatModule().isBuilt()
    ? getActiveChatModule().getBuilt().artKeywordRepository
    : undefined;

export const getDescribeService = (): DescribeService | undefined =>
  getActiveChatModule().isBuilt() ? getActiveChatModule().getBuilt().describeService : undefined;

export const getLlmCircuitBreakerState = (): ReturnType<ChatModule['getLlmCircuitBreakerState']> =>
  getActiveChatModule().getLlmCircuitBreakerState();

export const getLlmGuardCircuitBreakerState = (): ReturnType<
  ChatModule['getLlmGuardCircuitBreakerState']
> => getActiveChatModule().getLlmGuardCircuitBreakerState();

/**
 * Consumed by `/api/health/deep` (Phase 1 semantic probe). Undefined when
 * module not built OR `GUARDRAILS_V2_LLM_GUARD_URL` unset — both collapse to
 * "no semantic probe available" → empty `checks.guardrails` array.
 */
export const getGuardrailProvider = (): GuardrailProvider | undefined =>
  getActiveChatModule().getGuardrailProvider();

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

/**
 * GDPR Art. 22 + AI Act Art. 14 — `GET /api/chat/messages/:id/explanation`.
 * Undefined when module not built — mount the endpoint conditionally.
 */
export const getMessageExplanationUseCase = (): GetMessageExplanationUseCase | undefined =>
  getActiveChatModule().isBuilt()
    ? getActiveChatModule().getBuilt().getMessageExplanationUseCase
    : undefined;

/**
 * W3 (T5.3) — `PATCH /api/chat/sessions/:id/context`. Undefined when module
 * not built — mount the endpoint conditionally.
 */
export const getUpdateSessionContextUseCase = (): UpdateSessionContextUseCase | undefined =>
  getActiveChatModule().isBuilt()
    ? getActiveChatModule().getBuilt().updateSessionContextUseCase
    : undefined;
