import { CircuitOpenError } from '@modules/chat/domain/errors/circuit-open.error';
import { DisabledAudioTranscriber } from '@modules/chat/domain/ports/audio-transcriber.port';
import { ChatMediaService } from '@modules/chat/useCase/audio/chat-media.service';
import { LlmCacheServiceImpl } from '@modules/chat/useCase/llm/llm-cache.service';
import { ChatMessageService } from '@modules/chat/useCase/message/chat-message.service';
import { ChatSessionService } from '@modules/chat/useCase/session/chat-session.service';
import { logger } from '@shared/logger/logger';
import { chatRequestDurationSeconds } from '@shared/observability/prometheus-metrics';

import type {
  CreateSessionResult,
  DeleteSessionResult,
  FeedbackMessageResult,
  ListSessionsResult,
  PostAudioMessageResult,
  PostMessageResult,
  ReportMessageResult,
  SessionResult,
} from './chat.service.types';
import type {
  CreateSessionInput,
  MessagePageQuery,
  PostAudioMessageInput,
  PostMessageInput,
  ReportReason,
} from '@modules/chat/domain/chat.types';
import type { FeedbackValue } from '@modules/chat/domain/message/messageFeedback.entity';
import type { AudioStorage } from '@modules/chat/domain/ports/audio-storage.port';
import type { AudioTranscriber } from '@modules/chat/domain/ports/audio-transcriber.port';
import type { ChatOrchestrator } from '@modules/chat/domain/ports/chat-orchestrator.port';
import type { GuardrailProvider } from '@modules/chat/domain/ports/guardrail-provider.port';
import type { ImageProcessorPort } from '@modules/chat/domain/ports/image-processor.port';
import type { ImageStorage } from '@modules/chat/domain/ports/image-storage.port';
import type { OcrService } from '@modules/chat/domain/ports/ocr.port';
import type { PiiSanitizer } from '@modules/chat/domain/ports/pii-sanitizer.port';
import type { TextToSpeechService } from '@modules/chat/domain/ports/tts.port';
import type { ChatRepository } from '@modules/chat/domain/session/chat.repository.interface';
import type { LlmJudgeFn } from '@modules/chat/useCase/guardrail/guardrail-evaluation.service';
import type { IGuardrailFrictionStore } from '@modules/chat/useCase/guardrail/guardrail-friction.store';
import type { ImageEnrichmentService } from '@modules/chat/useCase/image/image-enrichment.service';
import type { KnowledgeBaseService } from '@modules/chat/useCase/knowledge/knowledge-base.service';
import type { KnowledgeRouterPort } from '@modules/chat/useCase/knowledge/knowledge-router.service';
import type {
  LocationConsentChecker,
  LocationResolver,
} from '@modules/chat/useCase/location-resolver';
import type { UserMemoryService } from '@modules/chat/useCase/memory/user-memory.service';
import type { UrlHeadProbe } from '@modules/chat/useCase/orchestration/url-head-probe';
import type { ThirdPartyAiConsentChecker } from '@modules/chat/useCase/third-party-ai-consent-checker';
import type { WebSearchService } from '@modules/chat/useCase/web-search/web-search.service';
import type { ArtworkKnowledgeRepoPort } from '@modules/knowledge-extraction/domain/ports/artwork-knowledge-repo.port';
import type { ExtractionQueuePort } from '@modules/knowledge-extraction/domain/ports/extraction-queue.port';
import type { DbLookupService } from '@modules/knowledge-extraction/useCase/lookup/db-lookup.service';
import type { IMuseumRepository } from '@modules/museum/domain/museum/museum.repository.interface';
import type { AuditService } from '@shared/audit/audit.service';
import type { CacheService } from '@shared/cache/cache.port';

export type {
  CreateSessionResult,
  PostMessageResult,
  PostAudioMessageResult,
  DeleteSessionResult,
  ReportMessageResult,
  SessionResult,
  ListSessionsResult,
} from './chat.service.types';

export interface ChatServiceDeps {
  repository: ChatRepository;
  orchestrator: ChatOrchestrator;
  imageStorage: ImageStorage;
  /** GDPR Art. 5(1)(c) — EXIF stripper. Omitting disables strip (legacy tests only). */
  imageProcessor?: ImageProcessorPort;
  audioTranscriber?: AudioTranscriber;
  audioStorage?: AudioStorage;
  tts?: TextToSpeechService;
  cache?: CacheService;
  ocr?: OcrService;
  audit?: AuditService;
  userMemory?: UserMemoryService;
  knowledgeBase?: KnowledgeBaseService;
  knowledgeRouter?: KnowledgeRouterPort;
  imageEnrichment?: ImageEnrichmentService;
  webSearch?: WebSearchService;
  guardrailProvider?: GuardrailProvider;
  guardrailProviderObserveOnly?: boolean;
  llmJudge?: LlmJudgeFn;
  /** True when env.guardrails.budgetCentsPerDay > 0 (judge layer enabled). */
  llmJudgeEnabled?: boolean;
  /**
   * Hybrid-gravity guardrail (2026-06-01) — 2-level friction counter store +
   * config. When omitted, the friction model degrades to plain soft-redirect
   * (no escalation). See {@link ChatSafetyDeps}.
   */
  frictionStore?: IGuardrailFrictionStore;
  frictionEnabled?: boolean;
  frictionSessionThreshold?: number;
  frictionUserThreshold?: number;
  piiSanitizer?: PiiSanitizer;
  museumRepository?: IMuseumRepository;
  dbLookup?: DbLookupService;
  extractionQueue?: ExtractionQueuePort;
  /**
   * W3 (T5.4) — used by the pipeline to look up `artwork_knowledge` rows for
   * the LLM prompt `[CURRENT ARTWORK]` section when a cartel deeplink was
   * scanned and `chatSession.currentArtworkId` is populated.
   */
  artworkKnowledgeRepo?: ArtworkKnowledgeRepoPort;
  locationResolver?: LocationResolver;
  /** GDPR consent port — gates whether the LLM prompt receives any location. */
  locationConsentChecker?: LocationConsentChecker;
  /**
   * GDPR Art. 7 — gates text + image LLM dispatch on the granular
   * `third_party_ai_<text|image>_<provider>` scopes (cluster A R2/R3). When
   * omitted, the legacy always-allow path is preserved.
   */
  thirdPartyAiConsentChecker?: ThirdPartyAiConsentChecker;
  urlHeadProbe?: UrlHeadProbe;
}

/**
 * Facade delegating to {@link ChatSessionService} (CRUD),
 * {@link ChatMessageService} (posting/streaming), {@link ChatMediaService} (refs/TTS).
 */
export class ChatService {
  private readonly sessions: ChatSessionService;
  private readonly messages: ChatMessageService;
  private readonly media: ChatMediaService;

  constructor(deps: ChatServiceDeps) {
    const audioTranscriber = deps.audioTranscriber ?? new DisabledAudioTranscriber();

    this.sessions = new ChatSessionService({
      repository: deps.repository,
      cache: deps.cache,
      museumRepository: deps.museumRepository,
    });

    this.messages = new ChatMessageService({
      repository: deps.repository,
      orchestrator: deps.orchestrator,
      imageStorage: deps.imageStorage,
      imageProcessor: deps.imageProcessor,
      audioTranscriber,
      cache: deps.cache,
      llmCache: deps.cache ? new LlmCacheServiceImpl(deps.cache) : undefined,
      urlHeadProbe: deps.urlHeadProbe,
      ocr: deps.ocr,
      enrichment: {
        userMemory: deps.userMemory,
        knowledgeBase: deps.knowledgeBase,
        knowledgeRouter: deps.knowledgeRouter,
        imageEnrichment: deps.imageEnrichment,
        webSearch: deps.webSearch,
        dbLookup: deps.dbLookup,
        extractionQueue: deps.extractionQueue,
        locationResolver: deps.locationResolver,
        locationConsentChecker: deps.locationConsentChecker,
        thirdPartyAiConsentChecker: deps.thirdPartyAiConsentChecker,
        artworkKnowledgeRepo: deps.artworkKnowledgeRepo,
      },
      safety: {
        guardrailProvider: deps.guardrailProvider,
        guardrailProviderObserveOnly: deps.guardrailProviderObserveOnly,
        llmJudge: deps.llmJudge,
        llmJudgeEnabled: deps.llmJudgeEnabled,
        frictionStore: deps.frictionStore,
        frictionEnabled: deps.frictionEnabled,
        frictionSessionThreshold: deps.frictionSessionThreshold,
        frictionUserThreshold: deps.frictionUserThreshold,
        audit: deps.audit,
        piiSanitizer: deps.piiSanitizer,
      },
    });

    this.media = new ChatMediaService({
      repository: deps.repository,
      tts: deps.tts,
      cache: deps.cache,
      audioStorage: deps.audioStorage,
    });
  }

  // ── Session CRUD ──

  /** @throws {AppError} 400 if userId is not a positive integer. */
  async createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
    logger.info('chat_service_call', { method: 'createSession', userId: input.userId });
    return await this.sessions.createSession(input);
  }

  /** @throws {AppError} 400 on invalid id, 404 if not found or not owned. */
  async getSession(
    sessionId: string,
    page: MessagePageQuery,
    currentUserId?: number,
  ): Promise<SessionResult> {
    return await this.sessions.getSession(sessionId, page, currentUserId);
  }

  /** @throws {AppError} 400 if userId missing/invalid or cursor malformed. */
  async listSessions(page: MessagePageQuery, currentUserId?: number): Promise<ListSessionsResult> {
    return await this.sessions.listSessions(page, currentUserId);
  }

  /**
   * Deletes session only if it contains no messages.
   *
   * @throws {AppError} 400 on invalid id, 404 if not found or not owned.
   */
  async deleteSessionIfEmpty(
    sessionId: string,
    currentUserId?: number,
  ): Promise<DeleteSessionResult> {
    logger.info('chat_service_call', {
      method: 'deleteSessionIfEmpty',
      sessionId,
      userId: currentUserId,
    });
    return await this.sessions.deleteSessionIfEmpty(sessionId, currentUserId);
  }

  // ── Message posting ──

  /**
   * Input guardrail → persist user → LLM → output guardrail → persist assistant.
   *
   * @throws {AppError} 400 invalid, 404 not found, 409 optimistic lock conflict.
   */
  async postMessage(
    sessionId: string,
    input: PostMessageInput,
    requestId?: string,
    currentUserId?: number,
    ip?: string,
  ): Promise<PostMessageResult> {
    logger.info('chat_service_call', {
      method: 'postMessage',
      sessionId,
      userId: currentUserId,
      requestId,
    });
    return await measureChatRequest(() =>
      this.messages.postMessage(sessionId, input, requestId, currentUserId, ip),
    );
  }

  /** Transcribes audio → delegates to {@link postMessage}. */
  async postAudioMessage(
    sessionId: string,
    input: PostAudioMessageInput,
    requestId?: string,
    currentUserId?: number,
    ip?: string,
  ): Promise<PostAudioMessageResult> {
    return await measureChatRequest(() =>
      this.messages.postAudioMessage(sessionId, input, requestId, currentUserId, ip),
    );
  }

  // ── Media & reporting ──

  async getMessageImageRef(
    messageId: string,
    currentUserId?: number,
  ): Promise<{
    imageRef: string;
    fileName?: string;
    contentType?: string;
  }> {
    return await this.media.getMessageImageRef(messageId, currentUserId);
  }

  /**
   * Bypasses session-ownership: the signed HMAC token IS the authorization.
   * MUST only be called after `verifySignedChatImageReadUrl` returns ok.
   */
  async getMessageImageRefBySignedToken(messageId: string): Promise<{
    imageRef: string;
    fileName?: string;
    contentType?: string;
  }> {
    return await this.media.getMessageImageRefBySignedToken(messageId);
  }

  async reportMessage(
    messageId: string,
    reason: ReportReason,
    currentUserId: number,
    comment?: string,
  ): Promise<ReportMessageResult> {
    return await this.media.reportMessage(messageId, reason, currentUserId, comment);
  }

  /** @returns 'created' | 'updated' | 'removed'. */
  async setMessageFeedback(
    messageId: string,
    currentUserId: number,
    value: FeedbackValue,
  ): Promise<FeedbackMessageResult> {
    return await this.media.setMessageFeedback(messageId, currentUserId, value);
  }

  /**
   * @returns Audio buffer or null when message has no text.
   * @throws {AppError} 400 not assistant, 501 TTS unavailable, 404 not found/owned.
   */
  async synthesizeSpeech(
    messageId: string,
    currentUserId?: number,
  ): Promise<{ audio: Buffer; contentType: string } | null> {
    return await this.media.synthesizeSpeech(messageId, currentUserId);
  }

  async getMessageAudioUrl(
    messageId: string,
    currentUserId?: number,
  ): Promise<{ url: string; expiresAt: string; voice: string; generatedAt: string } | null> {
    return await this.media.getMessageAudioUrl(messageId, currentUserId);
  }
}

type ChatRequestOutcome = 'success' | 'error' | 'guardrail_blocked' | 'circuit_open' | 'cache_hit';

/**
 * Records `chat_request_duration_seconds` with outcome label. Fail-open: Prom
 * client throws cannot propagate. `cache_hit` / `guardrail_blocked` outcomes
 * are only reachable today via thrown errors — success-path detection still
 * needs a structured signal from {@link ChatMessageService}.
 */
async function measureChatRequest<T>(fn: () => Promise<T>): Promise<T> {
  const startedAtMs = Date.now();
  let outcome: ChatRequestOutcome = 'success';
  try {
    return await fn();
  } catch (err) {
    outcome = classifyChatRequestError(err);
    throw err;
  } finally {
    try {
      chatRequestDurationSeconds.observe({ outcome }, (Date.now() - startedAtMs) / 1000);
    } catch (metricErr) {
      logger.warn('chat_request_metric_drop', {
        outcome,
        err: metricErr instanceof Error ? metricErr.message : String(metricErr),
      });
    }
  }
}

function classifyChatRequestError(err: unknown): ChatRequestOutcome {
  if (err instanceof CircuitOpenError) return 'circuit_open';
  return 'error';
}
