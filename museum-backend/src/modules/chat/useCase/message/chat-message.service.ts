import { DisabledAudioTranscriber } from '@modules/chat/domain/ports/audio-transcriber.port';
import { DisabledPiiSanitizer } from '@modules/chat/domain/ports/pii-sanitizer.port';
import { validateAudioInput } from '@modules/chat/useCase/audio/audio-validation';
import { buildSttPromptBiasFromVisitContext } from '@modules/chat/useCase/audio/stt-prompt-bias';
import { FrictionEscalationService } from '@modules/chat/useCase/guardrail/guardrail-escalation';
import { GuardrailEvaluationService } from '@modules/chat/useCase/guardrail/guardrail-evaluation.service';
import { ImageProcessingService } from '@modules/chat/useCase/image/image-processing.service';
import { buildLlmCacheInput } from '@modules/chat/useCase/message/llm-cache-input.helper';
import { commitAssistantResponse } from '@modules/chat/useCase/orchestration/message-commit';
import { PrepareMessagePipeline } from '@modules/chat/useCase/orchestration/prepare-message.pipeline';
import { ensureSessionAccess } from '@modules/chat/useCase/session/session-access';
import { AppError, badRequest, serviceUnavailable } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { emitChatPhaseSpan } from '@shared/observability/chat-phase-span';
import { deriveTier } from '@shared/observability/derive-tier';
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
import type { GuardrailProvider } from '@modules/chat/domain/ports/guardrail-provider.port';
import type { ImageProcessorPort } from '@modules/chat/domain/ports/image-processor.port';
import type { ImageStorage } from '@modules/chat/domain/ports/image-storage.port';
import type { OcrService } from '@modules/chat/domain/ports/ocr.port';
import type { PiiSanitizer } from '@modules/chat/domain/ports/pii-sanitizer.port';
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
import type { ChatPhaseOutcome } from '@shared/observability/chat-phase-timer';

/**
 * SEC — AppError + {statusCode,code} shape preserved verbatim; everything else
 * becomes 503 LLM_UNAVAILABLE (no 500 leak, no provider-name leak).
 */
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
    error: err instanceof Error ? err.message : String(err),
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
  /**
   * PR-P0-1 (2026-05-23) — exact `llm:{KEY_VERSION}:*` Redis key emitted by
   * `LlmCacheServiceImpl.computeKey()` on the lookup OR store path.
   * Threaded into `commitAssistantResponse` so the assistant `ChatMessage`
   * row is stamped with the key for later feedback-driven invalidation.
   * Populated on both cache-MISS-then-store and cache-HIT branches (a hit
   * still writes a NEW assistant row — that row gets the SAME key as the
   * cached entry, so feedback on either copy invalidates the shared entry).
   * Undefined when the cache is bypassed (image w/o visual signature, no
   * llmCache configured, image-only path with empty sanitizedText).
   */
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
  /** GDPR — gates whether location reaches LLM at all. */
  locationConsentChecker?: LocationConsentChecker;
  /**
   * GDPR Art. 7 — gates text + image LLM dispatch on the granular
   * `third_party_ai_<text|image>_<provider>` scopes (R2/R3). Without checker
   * the legacy always-allow path is preserved (pre-launch migration window).
   */
  thirdPartyAiConsentChecker?: ThirdPartyAiConsentChecker;
  /** W3 (T5.4) — looked up by pipeline for the `[CURRENT ARTWORK]` prompt section. */
  artworkKnowledgeRepo?: ArtworkKnowledgeRepoPort;
}

export interface ChatSafetyDeps {
  guardrailProvider?: GuardrailProvider;
  guardrailProviderObserveOnly?: boolean;
  audit?: AuditService;
  piiSanitizer?: PiiSanitizer;
  llmJudge?: LlmJudgeFn;
  /** True when env.guardrails.budgetCentsPerDay > 0 (judge layer enabled). */
  llmJudgeEnabled?: boolean;
  /**
   * Hybrid-gravity guardrail (2026-06-01) — 2-level friction counter. When
   * `frictionEnabled` (default `env.guardrails.frictionEnabled`), the judge runs
   * in PARALLEL of generation and an isolated off-topic is soft-redirected,
   * escalating to a hard-block cool-down only past the thresholds. When the
   * store is omitted, the friction model degrades to plain soft-redirect (no
   * escalation) — never a hard block (FAIL-SOFT).
   */
  frictionStore?: IGuardrailFrictionStore;
  frictionEnabled?: boolean;
  frictionSessionThreshold?: number;
  frictionUserThreshold?: number;
}

export interface ChatMessageServiceDeps {
  repository: ChatRepository; // 1 — session + message persistence
  orchestrator: ChatOrchestrator; // 2 — LLM call
  imageStorage: ImageStorage; // 3 — upload / ref resolution
  audioTranscriber?: AudioTranscriber; // 4 — STT (postAudioMessage path)
  cache?: CacheService; // 5 — response caching
  ocr?: OcrService; // 6 — OCR text extraction from images
  enrichment?: ChatEnrichmentDeps;
  safety?: ChatSafetyDeps;
  /** GDPR Art. 5(1)(c) EXIF/metadata stripper. */
  imageProcessor?: ImageProcessorPort;
  /** Bypass: streaming path, env.llm.cacheEnabled=false, image present. */
  llmCache?: LlmCacheService;
  urlHeadProbe?: UrlHeadProbe;
}

/** Delegates pre-LLM to PrepareMessagePipeline, then orchestrator + commit. */
export class ChatMessageService {
  private readonly repository: ChatRepository;
  private readonly orchestrator: ChatOrchestrator;
  private readonly guardrail: GuardrailEvaluationService;
  private readonly pipeline: PrepareMessagePipeline;
  private readonly audioTranscriber: AudioTranscriber;
  private readonly cache?: CacheService;
  private readonly userMemory?: UserMemoryService;
  private readonly piiSanitizer: PiiSanitizer;
  private readonly llmCache?: LlmCacheService;
  private readonly urlHeadProbe?: UrlHeadProbe;
  /** Hybrid-gravity (2026-06-01) — friction policy collaborator (design §5). */
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
    this.piiSanitizer = safety.piiSanitizer ?? new DisabledPiiSanitizer();

    const frictionEnabled = safety.frictionEnabled ?? env.guardrails.frictionEnabled;

    const imageProcessor = new ImageProcessingService({
      imageStorage: deps.imageStorage,
      ocr: deps.ocr,
      imageProcessor: deps.imageProcessor,
    });

    this.guardrail = new GuardrailEvaluationService({
      repository: deps.repository,
      audit: safety.audit,
      guardrailProvider: safety.guardrailProvider,
      guardrailProviderObserveOnly: safety.guardrailProviderObserveOnly,
      llmJudge: safety.llmJudge,
      llmJudgeEnabled: safety.llmJudgeEnabled,
      frictionEnabled,
    });

    this.friction = new FrictionEscalationService({
      guardrail: this.guardrail,
      frictionStore: safety.frictionStore,
      frictionEnabled,
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
        // PR-P0-1 (2026-05-23) — stamp the LLM-cache-invalidation cookie
        // on the assistant row so feedback can purge the exact entry.
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

    // LLM02 — substitute provider-scrubbed PII BEFORE local sanitizer so LLM
    // payload + cache key carry only placeholders, never raw PII.
    const effectiveUserText = prep.redactedText ?? input.text?.trim() ?? '';
    const sanitizedText = this.piiSanitizer.sanitize(effectiveUserText).sanitizedText;
    const orchestratorInput = this.pipeline.buildOrchestratorInput(
      prep,
      input,
      sanitizedText,
      requestId,
    );

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
      // PR-P0-1 (2026-05-23) — cache-HIT path still writes a NEW assistant
      // row ; stamp the SAME `cacheKey` as the cached entry so feedback on
      // either copy invalidates the shared cache line. `cacheCtx.cacheKey`
      // is populated by `tryLlmCacheLookup` (mirror of `tryLlmCacheStore`).
      return await this.commitResponse(sessionId, prep, cached, {
        requestId,
        ip,
        cacheKey: cacheCtx.cacheKey ?? null,
      });
    }

    // Hybrid-gravity (2026-06-01) — friction scopes for this turn. `session` is
    // always present; `user` when authenticated, else `ip` (hashed — RGPD).
    const scopes = this.friction.scopesFor(sessionId, prep.ownerId ?? currentUserId, ip);

    // R11 pre-check — if this user/IP (any session) OR this session is in an
    // armed cool-down window, short-circuit to the cool-down WITHOUT generating
    // (no LLM spend). FAIL-SOFT: a store outage reports `false` → never blocks.
    if (this.friction.isEnabled && (await this.friction.isAnyScopeCoolingDown(scopes))) {
      return await this.buildCoolDownResult(sessionId, prep);
    }

    // A5 R4 — composing span. merged_bug_004 — try/finally emits on success
    // AND failure (time-to-failure is the window engineers need).
    const composingStartedAtMs = Date.now();
    let friction: FrictionTurnOutcome;
    let outcome: ChatPhaseOutcome = 'success';
    try {
      // Hybrid-gravity (2026-06-01) — when friction is enabled, run the off-topic
      // SEMANTIC judge IN PARALLEL of generation (Promise.allSettled), so an
      // on-topic message adds ~0 latency (NFR-Latence-1) and the judge never
      // sits in series ahead of the answer. When disabled (kill-switch), the
      // legacy inline judge already ran in `prepare` → just generate.
      friction = this.friction.isEnabled
        ? await this.friction.runParallel(
            async () => await this.orchestrator.generate(orchestratorInput),
            sanitizedText,
            scopes,
            { sessionId, userId: prep.ownerId ?? currentUserId, requestId, ip },
          )
        : { kind: 'answer', aiResult: await this.orchestrator.generate(orchestratorInput) };
    } catch (err) {
      outcome = 'error';
      // 503 SERVICE_UNAVAILABLE not 500 — provider failure is degraded
      // dependency, not internal bug. AppError subclasses preserved.
      throw mapOrchestratorError(err, requestId);
    } finally {
      emitChatPhaseSpan('composing', composingStartedAtMs, {
        sessionId,
        requestId,
        hasImage: Boolean(orchestratorInput.image),
        outcome,
      });
    }

    // Off-topic crossed a threshold → SUPPRESS the generated answer and return
    // the cool-down (the generation's tokens are already paid — abort is an
    // unwired optimisation, see design §0). Skip the LLM cache store: a refusal
    // must never be cached.
    if (friction.kind === 'cooldown') {
      return await this.buildCoolDownResult(sessionId, prep);
    }

    const aiResult = friction.aiResult;
    await this.tryLlmCacheStore(cacheCtx, aiResult);

    // PR-P0-1 (2026-05-23) — stamp the cookie on the persisted assistant row
    // so feedback can purge the exact entry. `cacheCtx.cacheKey` is null when
    // the cache was bypassed (image w/o signature, no llmCache, empty text).
    return await this.commitResponse(sessionId, prep, aiResult, {
      requestId,
      ip,
      cacheKey: cacheCtx.cacheKey ?? null,
    });
  }

  /**
   * Hybrid-gravity (2026-06-01) — on a SECURITY hard-block (V1 keyword / sidecar
   * block, non-off_topic reason) records a SECURITY-weight strike (2) on session
   * + principal so a repeat injection / PII spammer escalates into the global
   * cool-down (design §5 / spec R2). FAIL-SOFT: NEVER alters the hard-block
   * already encoded in `prep.result`.
   */
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

  /**
   * Persists the assistant cool-down refusal (warm `refocus` copy,
   * `policy:off_topic` citation). The user message was ALREADY persisted by
   * `prepare`, so only the refusal is written here (no double-persist).
   */
  private async buildCoolDownResult(
    sessionId: string,
    prep: PrepareReady,
  ): Promise<PostMessageResult> {
    return await this.guardrail.buildCoolDownRefusal({
      sessionId,
      requestedLocale: prep.requestedLocale,
    });
  }

  /** G — Attempts cache lookup; returns the cached result on hit, null on miss/bypass. */
  private async tryLlmCacheLookup(ctx: LlmCacheCtx): Promise<OrchestratorOutput | null> {
    const llmCache = this.llmCache;
    if (!llmCache) return null;
    // C3 (R11/R12) — image presence alone is no longer a bypass condition.
    // Bypass only when an image is present BUT no visual signature was
    // computable (url-source, or image processing failed). Text-only paths
    // fall through identically to today (R8 — legacy keys preserved).
    const hasImage = Boolean(ctx.input.image ?? ctx.orchestratorInput.image);
    const hasVisualSignature = Boolean(ctx.prep.imageContentHash);
    if (hasImage && !hasVisualSignature) return null;
    const cacheInput = buildLlmCacheInput(ctx.prep, ctx.sanitizedText, ctx.input);
    if (!cacheInput) return null;
    // PR-P0-1 (2026-05-23) — stash the exact byte-string key BEFORE the
    // lookup so the cache-HIT branch can stamp the persisted assistant row
    // with the same cookie used by `LlmCacheServiceImpl.lookup`. Pure (no
    // I/O) — identical derivation to `lookup`/`store` internals.
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

  /** Bypass mirrors lookup (invariant: miss→store→hit). */
  private async tryLlmCacheStore(ctx: LlmCacheCtx, aiResult: OrchestratorOutput): Promise<void> {
    const llmCache = this.llmCache;
    if (!llmCache) return;
    const hasImage = Boolean(ctx.input.image ?? ctx.orchestratorInput.image);
    const hasVisualSignature = Boolean(ctx.prep.imageContentHash);
    if (hasImage && !hasVisualSignature) return;
    const cacheInput = buildLlmCacheInput(ctx.prep, ctx.sanitizedText, ctx.input);
    if (!cacheInput) return;
    // PR-P0-1 (2026-05-23) — stash the exact byte-string key BEFORE the
    // store so the assistant row gets stamped with the SAME cookie that
    // hits Redis. Idempotent if `tryLlmCacheLookup` already populated it
    // (same `cacheInput` → same key — derivation is pure).
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

  /** Transcribes an audio message then delegates to postMessage for LLM processing. */
  async postAudioMessage(
    sessionId: string,
    input: PostAudioMessageInput,
    requestId?: string,
    currentUserId?: number,
    ip?: string,
  ): Promise<PostAudioMessageResult> {
    const session = await ensureSessionAccess(sessionId, this.repository, currentUserId);

    validateAudioInput(input.audio);

    // W7.4 (2026-05-17) — bias STT toward the artist/title proper nouns
    // already discussed in this session. Public museum data only — no PII.
    const sttPromptBias = buildSttPromptBiasFromVisitContext(session.visitContext);

    let transcription: AudioTranscriptionResult;
    try {
      transcription = await this.audioTranscriber.transcribe({
        base64: input.audio.base64,
        mimeType: input.audio.mimeType,
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string fallback
        locale: input.context?.locale || session.locale || undefined,
        requestId,
        prompt: sttPromptBias,
        // TD-20 (R13b/R12) — per-tenant scope for the STT cost path. `museumId`
        // spread-omit (absent => key omitted, never `null`); `tier` derived from
        // the requesting user via the shared `deriveTier`.
        ...(session.museumId != null ? { museumId: session.museumId } : {}),
        tier: deriveTier(currentUserId),
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw badRequest('audio_transcription_failed', {
        requestId,
        cause: err instanceof Error ? err.message : String(err),
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
    );

    return {
      ...response,
      transcription,
    };
  }
}
