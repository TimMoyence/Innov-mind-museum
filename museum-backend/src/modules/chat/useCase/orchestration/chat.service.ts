import { DisabledAudioTranscriber } from '@modules/chat/domain/ports/audio-transcriber.port';
import { ChatMediaService } from '@modules/chat/useCase/audio/chat-media.service';
import { LlmCacheServiceImpl } from '@modules/chat/useCase/llm/llm-cache.service';
import { ChatMessageService } from '@modules/chat/useCase/message/chat-message.service';
import { ChatSessionService } from '@modules/chat/useCase/session/chat-session.service';
import { logger } from '@shared/logger/logger';

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
import type { ImageProcessorPort } from '@modules/chat/domain/ports/image-processor.port';
import type { ImageStorage } from '@modules/chat/domain/ports/image-storage.port';
import type { OcrService } from '@modules/chat/domain/ports/ocr.port';
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
  llmJudge?: LlmJudgeFn;
  llmJudgeEnabled?: boolean;
  frictionStore?: IGuardrailFrictionStore;
  frictionSessionThreshold?: number;
  frictionUserThreshold?: number;
  museumRepository?: IMuseumRepository;
  dbLookup?: DbLookupService;
  extractionQueue?: ExtractionQueuePort;
  artworkKnowledgeRepo?: ArtworkKnowledgeRepoPort;
  locationResolver?: LocationResolver;
  locationConsentChecker?: LocationConsentChecker;
  thirdPartyAiConsentChecker?: ThirdPartyAiConsentChecker;
  urlHeadProbe?: UrlHeadProbe;
}

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
        llmJudge: deps.llmJudge,
        llmJudgeEnabled: deps.llmJudgeEnabled,
        frictionStore: deps.frictionStore,
        frictionSessionThreshold: deps.frictionSessionThreshold,
        frictionUserThreshold: deps.frictionUserThreshold,
        audit: deps.audit,
      },
    });

    this.media = new ChatMediaService({
      repository: deps.repository,
      tts: deps.tts,
      cache: deps.cache,
      audioStorage: deps.audioStorage,
    });
  }

  async createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
    logger.info('chat_service_call', { method: 'createSession', userId: input.userId });
    return await this.sessions.createSession(input);
  }

  async getSession(
    sessionId: string,
    page: MessagePageQuery,
    currentUserId?: number,
  ): Promise<SessionResult> {
    return await this.sessions.getSession(sessionId, page, currentUserId);
  }

  async listSessions(page: MessagePageQuery, currentUserId?: number): Promise<ListSessionsResult> {
    return await this.sessions.listSessions(page, currentUserId);
  }

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
    return await this.messages.postMessage(sessionId, input, requestId, currentUserId, ip);
  }

  async postAudioMessage(
    sessionId: string,
    input: PostAudioMessageInput,
    requestId?: string,
    currentUserId?: number,
    ip?: string,
  ): Promise<PostAudioMessageResult> {
    return await this.messages.postAudioMessage(sessionId, input, requestId, currentUserId, ip);
  }

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

  async setMessageFeedback(
    messageId: string,
    currentUserId: number,
    value: FeedbackValue,
  ): Promise<FeedbackMessageResult> {
    return await this.media.setMessageFeedback(messageId, currentUserId, value);
  }

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
