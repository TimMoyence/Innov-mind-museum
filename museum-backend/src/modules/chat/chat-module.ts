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

// ═══════════════════════════════════════════════════════════════════
//  === Public typed result of build() ===
// ═══════════════════════════════════════════════════════════════════

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
}

// ═══════════════════════════════════════════════════════════════════
//  === Wikidata stack wiring (ex chat-module.wikidata-wiring.ts) ===
//
//  Composition (outermost → innermost):
//    WikidataWriteThroughProvider  ← C5.3 fire-and-forget UPSERT into dump
//      └─ WikidataBreakerClient    ← C5.1 opossum CB + null fallback
//           └─ WikidataClient      ← raw HTTP / SPARQL
//
//  Both downstream consumers — `KnowledgeBaseService` AND `KnowledgeRouterService`
//  — share the same `kbProvider` reference so the breaker state and dump write-
//  through are shared. Doctrine pré-launch V1 : no `*_ENABLED` flag, rollback
//  = `git revert` of the wiring.
// ═══════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════
//  === Knowledge router wiring (ex chat-module.knowledge-router-wiring.ts) ===
//
//  C4.1 — `KnowledgeRouterService` cascade: KB → LLM judge → WebSearch.
//  Each leg's per-leg budget is sourced from `env.knowledgeRouter.*` —
//  TUNING-ONLY by doctrine (D11 / pré-launch V1). NO `*_ENABLED` switch.
// ═══════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════
//  === Compare wiring (ex chat-module.compare-wiring.ts) ===
//
//  C3 Visual Similarity — composition root for the `POST /chat/compare` pipeline.
//  See `compare.use-case.ts` for the orchestration contract.
// ═══════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════
//  === ChatModule class — the composition root proper ===
// ═══════════════════════════════════════════════════════════════════

/**
 * Encapsulates the chat module dependency graph and lifecycle.
 * Call {@link build} to wire all dependencies; access them via {@link getBuilt}.
 */
export class ChatModule {
  private _built: BuiltChatModule | undefined;
  private _orchestrator: LangChainChatOrchestrator | undefined;
  private _guardrailCircuitBreaker: GuardrailCircuitBreaker | undefined;
  /**
   * 2026-05-13 — scalability primitives (perennial design §11). Wired here so
   * /api/health can surface their state and tests can `getCostCircuitBreaker()`
   * to assert. The cost breaker is process-scoped (in-memory rolling window).
   * The tenant rate limiter is built but NOT wired into the request pipeline
   * V1 — Phase 2 (B2B onset) consumes it from the chat use-case.
   */
  private _llmCostCircuitBreaker: LlmCostCircuitBreaker | undefined;
  private _tenantRateLimiter: TenantRateLimiter | undefined;
  /**
   * 2026-05-13 — Phase 1 perennial design: surfaces the active
   * `GuardrailProvider` adapter for `/api/health/deep` (semantic probe) and
   * any future shadow-mode aggregator. Single-instance reference so the
   * health probe and the use-case both target the SAME adapter (the metrics
   * counters on the adapter are local — calling `.health()` from a fresh
   * instance would dilute them).
   */
  private _guardrailProvider: GuardrailProvider | undefined;
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

  /**
   * Returns the LLM Guard sidecar circuit breaker state for the health endpoint.
   * Mirrors `getLlmCircuitBreakerState()` shape so the response payload stays
   * uniform across the two breakers exposed at `/api/health` (R8).
   */
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

  /**
   * 2026-05-13 — accessor for the LLM cost circuit breaker (perennial §11 D9).
   * Surfaced for /api/health, tests, and any future hook that needs to
   * `recordCharge`/`canAttempt` around a costed LLM call.
   */
  getLlmCostCircuitBreaker(): LlmCostCircuitBreaker | undefined {
    return this._llmCostCircuitBreaker;
  }

  /**
   * 2026-05-13 — accessor for the per-tenant rate limiter (perennial §11 D10).
   * NOT wired V1 (single B2C tenant); ready for Phase 2 (B2B onset).
   */
  getTenantRateLimiter(): TenantRateLimiter | undefined {
    return this._tenantRateLimiter;
  }

  /**
   * 2026-05-13 — accessor for the active `GuardrailProvider` adapter.
   * Returns `undefined` when `GUARDRAILS_V2_LLM_GUARD_URL` is unset or when
   * the module hasn't been built yet. Consumed by `/api/health/deep` to call
   * `provider.health()` and `provider.metrics()` for the semantic probe
   * payload (Phase 1).
   */
  getGuardrailProvider(): GuardrailProvider | undefined {
    return this._guardrailProvider;
  }

  /**
   * Idempotent accessor that lazily constructs the guardrail provider on first
   * call and caches it on `this._guardrailProvider`. Used by the chat use-case
   * factory so the `/api/health/deep` accessor and the chat hot path share ONE
   * adapter instance (its local counters + breaker reference would diverge if
   * we instantiated twice).
   */
  private getOrBuildGuardrailProvider(): GuardrailProvider | undefined {
    this._guardrailProvider ??= this.buildGuardrailProvider();
    return this._guardrailProvider;
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

  /** Creates the audio storage adapter (S3 or local). */
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

  /** Creates the guardrail provider adapter when GUARDRAILS_V2_LLM_GUARD_URL is set (ADR-048; ADR-015 amendment 2026-05-14). */
  private buildGuardrailProvider(): GuardrailProvider | undefined {
    const baseUrl = env.guardrails.llmGuardUrl;
    if (!baseUrl) return undefined;

    // Single breaker instance per process — shared between the input and
    // output scan paths so a sidecar degradation trips ONE breaker, not two
    // unsynchronised ones. Metrics are wired here via onStateChange so the
    // breaker primitive itself stays Prometheus-free.
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
                // ADR-048 Phase 0 anchor — stable literal until the per-tenant
                // policy resolver (Phase 2) populates real policy versions.
                // Anchors forensic replay across schema evolution.
                policyVersion: 'default-v0',
              },
            }),
            'llm_guard_breaker_open_audit',
          );
        }
      },
    });
    this._guardrailCircuitBreaker = breaker;

    // Seed gauges so dashboards see the healthy state before the first
    // transition (onStateChange only fires on transitions, not construction).
    llmGuardCircuitBreakerState.set({ state: 'closed' }, 1);
    llmGuardCircuitBreakerState.set({ state: 'half_open' }, 0);
    llmGuardCircuitBreakerState.set({ state: 'open' }, 0);

    // Single semaphore instance per process — shared across input + output
    // legs so the concurrency cap matches actual sidecar fan-out.
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

  /**
   * Wires the chat module dependency graph and returns all services as a typed object.
   *
   * @param dataSource - Initialized TypeORM DataSource for repository creation.
   * @param cache - Optional cache service for session/memory caching.
   * @param museumRepository - Optional museum repository for resolving museum info.
   * @returns Built module with all services guaranteed initialized.
   */
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

    // ─── Scalability primitives (perennial design §11, 100k clients prep) ───
    // Both instances live for the lifetime of the process. The cost breaker is
    // a singleton because its rolling window MUST be shared by every LLM call
    // site (a per-callsite breaker would never see a system-wide spike). The
    // tenant rate limiter is a singleton for the same fairness reason —
    // sharding it would defeat per-tenant accounting.
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
    // Seed gauges so dashboards see CLOSED before the first transition fires.
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

    // GDPR Art. 22 + AI Act Art. 14 — right-to-explanation use case.
    // Wired with a TypeORM-backed audit correlator so the response can return
    // the forensic `auditRef` linking back to the hash-chained audit row.
    const getMessageExplanationUseCase = new GetMessageExplanationUseCase({
      repository,
      auditCorrelator: new TypeOrmAuditCorrelator(dataSource),
    });

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
      // Cache the constructed provider on `this._guardrailProvider` so the
      // `/api/health/deep` accessor and the chat use-case share ONE adapter
      // instance — the adapter holds local counters (`metrics()`) and a
      // circuit-breaker reference; a second instantiation would diverge them.
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

// ═══════════════════════════════════════════════════════════════════
//  === Singleton (ex chat-module-singleton.ts) ===
// ═══════════════════════════════════════════════════════════════════

/**
 * Active chat module reference. Defaults to a fresh singleton on import so
 * existing call sites keep working, but `setActiveChatModule()` lets
 * `createApp()` and tests substitute their own instance.
 */
let active: ChatModule = new ChatModule();

/** Returns the active chat module — used by wiring accessors and the chat barrel. */
export const getActiveChatModule = (): ChatModule => active;

/** Swaps the active chat module. Call at boot inside `createApp()` or in tests. */
export const setActiveChatModule = (next: ChatModule): void => {
  active = next;
};

/** Resets to a fresh module — primarily for test teardown. */
export const resetActiveChatModule = (): void => {
  active = new ChatModule();
};

// ═══════════════════════════════════════════════════════════════════
//  === Runtime accessors (ex wiring.ts) ===
//
//  Used for lazy access to built services at request time
//  (e.g. api.router.ts, auth callbacks). For lifecycle management,
//  use the main barrel (`@modules/chat`).
// ═══════════════════════════════════════════════════════════════════

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
 * 2026-05-13 — runtime accessor for the active `GuardrailProvider` adapter.
 * Consumed by `/api/health/deep` (Phase 1 semantic probe). Returns
 * `undefined` when the chat module hasn't been built yet OR when
 * `GUARDRAILS_V2_LLM_GUARD_URL` is unset — both cases collapse to
 * "no semantic probe available", which the deep-health handler renders as
 * an empty `checks.guardrails` array.
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
 * GDPR Art. 22 + AI Act Art. 14 — runtime accessor for the right-to-explanation
 * use case (`GET /api/chat/messages/:id/explanation`). Returns `undefined` when
 * the chat module has not been built yet — consumers should mount the endpoint
 * conditionally so tests/composition order remain flexible.
 */
export const getMessageExplanationUseCase = (): GetMessageExplanationUseCase | undefined =>
  getActiveChatModule().isBuilt()
    ? getActiveChatModule().getBuilt().getMessageExplanationUseCase
    : undefined;
