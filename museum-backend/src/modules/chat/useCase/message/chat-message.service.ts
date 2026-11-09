import { DisabledAudioTranscriber } from '@modules/chat/domain/ports/audio-transcriber.port';
import { validateAudioInput } from '@modules/chat/useCase/audio/audio-validation';
import { buildSttPromptBiasFromVisitContext } from '@modules/chat/useCase/audio/stt-prompt-bias';
import { FrictionEscalationService } from '@modules/chat/useCase/guardrail/guardrail-escalation';
import { GuardrailEvaluationService } from '@modules/chat/useCase/guardrail/guardrail-evaluation.service';
import { ImageProcessingService } from '@modules/chat/useCase/image/image-processing.service';
import { buildLlmCacheInput } from '@modules/chat/useCase/message/llm-cache-input.helper';
import { commitAssistantResponse } from '@modules/chat/useCase/orchestration/message-commit';
import { PrepareMessagePipeline } from '@modules/chat/useCase/orchestration/prepare-message.pipeline';
import { ensureSessionAccess } from '@modules/chat/useCase/session/session-access';
import { AppError, badRequest, countedRefusal, serviceUnavailable } from '@shared/errors/app.error';
import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';
import { deriveTier } from '@shared/observability/derive-tier';
import { nonEmpty } from '@shared/utils/defaults';
import { env } from '@src/config/env';

import type { PostAudioMessageInput, PostMessageInput } from '@modules/chat/domain/chat.types';
import type {
  AudioTranscriptionResult,
  AudioTranscriber,
} from '@modules/chat/domain/ports/audio-transcriber.port';
import type {
  ChatOrchestrator,
  OrchestratorOutput,
} from '@modules/chat/domain/ports/chat-orchestrator.port';
import type { ImageProcessorPort } from '@modules/chat/domain/ports/image-processor.port';
import type { ImageStorage } from '@modules/chat/domain/ports/image-storage.port';
import type { OcrService } from '@modules/chat/domain/ports/ocr.port';
import type { ChatRepository } from '@modules/chat/domain/session/chat.repository.interface';
import type { FrictionTurnOutcome } from '@modules/chat/useCase/guardrail/guardrail-escalation';
import type { LlmJudgeFn } from '@modules/chat/useCase/guardrail/guardrail-evaluation.service';
import type { IGuardrailFrictionStore } from '@modules/chat/useCase/guardrail/guardrail-friction.store';
import type { ImageEnrichmentService } from '@modules/chat/useCase/image/image-enrichment.service';
import type { KnowledgeBaseService } from '@modules/chat/useCase/knowledge/knowledge-base.service';
import type { KnowledgeRouterPort } from '@modules/chat/useCase/knowledge/knowledge-router.service';
import type { LlmCacheService } from '@modules/chat/useCase/llm/llm-cache.types';
import type {
  LocationConsentChecker,
  LocationResolver,
} from '@modules/chat/useCase/location-resolver';
import type { UserMemoryService } from '@modules/chat/useCase/memory/user-memory.service';
import type {
  PostMessageResult,
  PostAudioMessageResult,
} from '@modules/chat/useCase/orchestration/chat.service.types';
import type {
  PrepareReady,
  PrepareRefused,
} from '@modules/chat/useCase/orchestration/prepare-message.pipeline';
import type { UrlHeadProbe } from '@modules/chat/useCase/orchestration/url-head-probe';
import type { ThirdPartyAiConsentChecker } from '@modules/chat/useCase/third-party-ai-consent-checker';
import type { WebSearchService } from '@modules/chat/useCase/web-search/web-search.service';
import type { ArtworkKnowledgeRepoPort } from '@modules/knowledge-extraction/domain/ports/artwork-knowledge-repo.port';
import type { ExtractionQueuePort } from '@modules/knowledge-extraction/domain/ports/extraction-queue.port';
import type { DbLookupService } from '@modules/knowledge-extraction/useCase/lookup/db-lookup.service';
import type { AuditService } from '@shared/audit/audit.service';
import type { CacheService } from '@shared/cache/cache.port';

const mapOrchestratorError = (err: unknown, requestId?: string): Error => {
  if (err instanceof AppError) return err;
  const candidate = err as { statusCode?: unknown; code?: unknown } | undefined;
  if (
    err instanceof Error &&
    typeof candidate?.statusCode === 'number' &&
    typeof candidate.code === 'string'
  ) {
    return err;
  }
  logger.warn('orchestrator_error_mapped_to_503', {
    requestId,
    error: errorMessage(err),
  });
  return serviceUnavailable('LLM provider unavailable', { code: 'LLM_UNAVAILABLE' });
};

interface LlmCacheCtx {
  prep: PrepareReady;
  sanitizedText: string;
  input: PostMessageInput;
  orchestratorInput: { image?: unknown };
  sessionId: string;
  requestId: string | undefined;
  cacheKey?: string;
}

export interface ChatEnrichmentDeps {
  userMemory?: UserMemoryService;
  knowledgeBase?: KnowledgeBaseService;
  knowledgeRouter?: KnowledgeRouterPort;
  imageEnrichment?: ImageEnrichmentService;
  webSearch?: WebSearchService;
  dbLookup?: DbLookupService;
  extractionQueue?: ExtractionQueuePort;
  locationResolver?: LocationResolver;
  locationConsentChecker?: LocationConsentChecker;
  thirdPartyAiConsentChecker?: ThirdPartyAiConsentChecker;
  artworkKnowledgeRepo?: ArtworkKnowledgeRepoPort;
}

export interface ChatSafetyDeps {
  audit?: AuditService;
  llmJudge?: LlmJudgeFn;
  llmJudgeEnabled?: boolean;
  frictionStore?: IGuardrailFrictionStore;
  frictionSessionThreshold?: number;
  frictionUserThreshold?: number;
}

export interface ChatMessageServiceDeps {
  repository: ChatRepository;
  orchestrator: ChatOrchestrator;
  imageStorage: ImageStorage;
  audioTranscriber?: AudioTranscriber;
  cache?: CacheService;
  ocr?: OcrService;
  enrichment?: ChatEnrichmentDeps;
  safety?: ChatSafetyDeps;
  imageProcessor?: ImageProcessorPort;
  llmCache?: LlmCacheService;
  urlHeadProbe?: UrlHeadProbe;
}

export class ChatMessageService {
  private readonly repository: ChatRepository;
  private readonly orchestrator: ChatOrchestrator;
  private readonly guardrail: GuardrailEvaluationService;
  private readonly pipeline: PrepareMessagePipeline;
  private readonly audioTranscriber: AudioTranscriber;
  private readonly cache?: CacheService;
  private readonly userMemory?: UserMemoryService;
  private readonly llmCache?: LlmCacheService;
  private readonly urlHeadProbe?: UrlHeadProbe;
  private readonly friction: FrictionEscalationService;

  constructor(deps: ChatMessageServiceDeps) {
    const enrichment = deps.enrichment ?? {};
    const safety = deps.safety ?? {};

    this.repository = deps.repository;
    this.orchestrator = deps.orchestrator;
    this.audioTranscriber = deps.audioTranscriber ?? new DisabledAudioTranscriber();
    this.cache = deps.cache;
    this.llmCache = deps.llmCache;
    this.urlHeadProbe = deps.urlHeadProbe;
    this.userMemory = enrichment.userMemory;

    const imageProcessor = new ImageProcessingService({
      imageStorage: deps.imageStorage,
      ocr: deps.ocr,
      imageProcessor: deps.imageProcessor,
    });

    this.guardrail = new GuardrailEvaluationService({
      repository: deps.repository,
      audit: safety.audit,
      llmJudge: safety.llmJudge,
      llmJudgeEnabled: safety.llmJudgeEnabled,
    });

    this.friction = new FrictionEscalationService({
      guardrail: this.guardrail,
      frictionStore: safety.frictionStore,
      frictionSessionThreshold:
        safety.frictionSessionThreshold ?? env.guardrails.frictionSessionThreshold,
      frictionUserThreshold: safety.frictionUserThreshold ?? env.guardrails.frictionUserThreshold,
    });

    this.pipeline = new PrepareMessagePipeline({
      repository: deps.repository,
      imageProcessor,
      guardrail: this.guardrail,
      userMemory: enrichment.userMemory,
      knowledgeBase: enrichment.knowledgeBase,
      knowledgeRouter: enrichment.knowledgeRouter,
      imageEnrichment: enrichment.imageEnrichment,
      webSearch: enrichment.webSearch,
      dbLookup: enrichment.dbLookup,
      extractionQueue: enrichment.extractionQueue,
      locationResolver: enrichment.locationResolver,
      locationConsentChecker: enrichment.locationConsentChecker,
      thirdPartyAiConsentChecker: enrichment.thirdPartyAiConsentChecker,
      artworkKnowledgeRepo: enrichment.artworkKnowledgeRepo,
    });
  }

  private async commitResponse(
    sessionId: string,
    prep: PrepareReady,
    aiResult: OrchestratorOutput,
    auditCtx?: { requestId?: string; ip?: string; cacheKey?: string | null },
  ): Promise<PostMessageResult> {
    return await commitAssistantResponse(
      {
        guardrail: this.guardrail,
        repository: this.repository,
        cache: this.cache,
        userMemory: this.userMemory,
        urlHeadProbe: this.urlHeadProbe,
      },
      sessionId,
      prep.session,
      aiResult,
      {
        requestedLocale: prep.requestedLocale,
        ownerId: prep.ownerId,
        enrichedImages: prep.enrichedImages,
        requestId: auditCtx?.requestId,
        ip: auditCtx?.ip,
        routerFacts: prep.routerFacts,
        routerSources: prep.routerSources,
        cacheKey: auditCtx?.cacheKey ?? null,
      },
    );
  }

  async postMessage(
    sessionId: string,
    input: PostMessageInput,
    requestId?: string,
    currentUserId?: number,
    ip?: string,
  ): Promise<PostMessageResult> {
    const prep = await this.pipeline.prepare(sessionId, input, requestId, currentUserId, ip);
    if (prep.kind === 'refused') {
      await this.recordSecurityStrikeOnRefusal(prep, sessionId, requestId, currentUserId, ip);
      return prep.result;
    }

    const orchestratorInput = this.pipeline.buildOrchestratorInput(
      prep,
      input,
      input.text?.trim() ?? '',
      requestId,
    );
    const sanitizedText = orchestratorInput.text ?? '';

    const cacheCtx: LlmCacheCtx = {
      prep,
      sanitizedText,
      input,
      orchestratorInput,
      sessionId,
      requestId,
    };
    const cached = await this.tryLlmCacheLookup(cacheCtx);
    if (cached) {
      return await this.commitResponse(sessionId, prep, cached, {
        requestId,
        ip,
        cacheKey: cacheCtx.cacheKey ?? null,
      });
    }

    const scopes = this.friction.scopesFor(sessionId, prep.ownerId ?? currentUserId, ip);

    if (await this.friction.isAnyScopeCoolingDown(scopes)) {
      return await this.buildCoolDownResult(sessionId, prep);
    }

    let friction: FrictionTurnOutcome;
    try {
      friction = await this.friction.runParallel(
        async () => await this.orchestrator.generate(orchestratorInput),
        sanitizedText,
        scopes,
        { sessionId, userId: prep.ownerId ?? currentUserId, requestId, ip },
      );
    } catch (err) {
      throw mapOrchestratorError(err, requestId);
    }

    if (friction.kind === 'cooldown') {
      return await this.buildCoolDownResult(sessionId, prep);
    }

    const aiResult = friction.aiResult;
    await this.tryLlmCacheStore(cacheCtx, aiResult);

    return await this.commitResponse(sessionId, prep, aiResult, {
      requestId,
      ip,
      cacheKey: cacheCtx.cacheKey ?? null,
    });
  }

  private async recordSecurityStrikeOnRefusal(
    prep: PrepareRefused,
    sessionId: string,
    requestId: string | undefined,
    currentUserId: number | undefined,
    ip: string | undefined,
  ): Promise<void> {
    if (!prep.securityBlock) return;
    const scopes = this.friction.scopesFor(sessionId, currentUserId, ip);
    await this.friction.recordSecurityStrike(scopes, {
      sessionId,
      userId: currentUserId,
      requestId,
      ip,
    });
  }

  private async buildCoolDownResult(
    sessionId: string,
    prep: PrepareReady,
  ): Promise<PostMessageResult> {
    return await this.guardrail.buildCoolDownRefusal({
      sessionId,
      requestedLocale: prep.requestedLocale,
    });
  }

  private async tryLlmCacheLookup(ctx: LlmCacheCtx): Promise<OrchestratorOutput | null> {
    const llmCache = this.llmCache;
    if (!llmCache) return null;
    const hasImage = Boolean(ctx.input.image ?? ctx.orchestratorInput.image);
    const hasVisualSignature = Boolean(ctx.prep.imageContentHash);
    if (hasImage && !hasVisualSignature) return null;
    const cacheInput = buildLlmCacheInput(ctx.prep, ctx.sanitizedText, ctx.input);
    if (!cacheInput) return null;
    ctx.cacheKey = llmCache.computeKey(cacheInput);
    const result = await llmCache.lookup<OrchestratorOutput>(cacheInput);
    if (result.hit && result.value) {
      logger.info('llm_cache_hit', {
        contextClass: result.contextClass,
        userId: ctx.prep.ownerId ?? 'anon',
        sessionId: ctx.sessionId,
        requestId: ctx.requestId,
        hasImage,
      });
      return result.value;
    }
    return null;
  }

  private async tryLlmCacheStore(ctx: LlmCacheCtx, aiResult: OrchestratorOutput): Promise<void> {
    const llmCache = this.llmCache;
    if (!llmCache || aiResult.degraded) return;
    const hasImage = Boolean(ctx.input.image ?? ctx.orchestratorInput.image);
    const hasVisualSignature = Boolean(ctx.prep.imageContentHash);
    if (hasImage && !hasVisualSignature) return;
    const cacheInput = buildLlmCacheInput(ctx.prep, ctx.sanitizedText, ctx.input);
    if (!cacheInput) return;
    ctx.cacheKey = llmCache.computeKey(cacheInput);
    await llmCache.store(cacheInput, aiResult);
    logger.info('llm_cache_miss', {
      contextClass: llmCache.classify(cacheInput),
      userId: ctx.prep.ownerId ?? 'anon',
      sessionId: ctx.sessionId,
      requestId: ctx.requestId,
      hasImage,
    });
  }

  async postAudioMessage(
    sessionId: string,
    input: PostAudioMessageInput,
    requestId?: string,
    currentUserId?: number,
    ip?: string,
  ): Promise<PostAudioMessageResult> {
    const session = await ensureSessionAccess(sessionId, this.repository, currentUserId);

    validateAudioInput(input.audio);

    const sttPromptBias = buildSttPromptBiasFromVisitContext(session.visitContext);

    let transcription: AudioTranscriptionResult;
    try {
      transcription = await this.audioTranscriber.transcribe({
        base64: input.audio.base64,
        mimeType: input.audio.mimeType,
        locale: nonEmpty(input.context?.locale) ?? nonEmpty(session.locale),
        requestId,
        prompt: sttPromptBias,
        ...(session.museumId != null ? { museumId: session.museumId } : {}),
        tier: deriveTier(currentUserId),
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw badRequest('audio_transcription_failed', {
        requestId,
        cause: errorMessage(err),
      });
    }

    const response = await this.postMessage(
      sessionId,
      {
        text: transcription.text,
        context: input.context,
      },
      requestId,
      currentUserId,
      ip,
    ).catch((error: unknown) => {
      throw countedRefusal(error);
    });

    return {
      ...response,
      transcription,
    };
  }
}
