/* eslint-disable max-lines -- service orchestrates message lifecycle across image, guardrail, LLM, and persistence layers */
import { AppError, badRequest, conflict } from '@shared/errors/app.error';
import { resolveLocale } from '@shared/i18n/locale';
import { env } from '@src/config/env';

import { evaluateUserInputGuardrail } from './art-topic-guardrail';
import { GuardrailEvaluationService } from './guardrail-evaluation.service';
import { ImageProcessingService } from './image-processing.service';
import { ensureSessionAccess } from './session-access';
import { computeSessionUpdates } from './visit-context';
import { DisabledAudioTranscriber } from '../domain/ports/audio-transcriber.port';

import type { ArtTopicClassifier } from './art-topic-classifier';
import type { GuardrailBlockReason } from './art-topic-guardrail';
import type { PostMessageResult, PostAudioMessageResult } from './chat.service.types';
import type { KnowledgeBaseService } from './knowledge-base.service';
import type { UserMemoryService } from './user-memory.service';
import type { ChatRepository } from '../domain/chat.repository.interface';
import type { PostAudioMessageInput, PostMessageInput } from '../domain/chat.types';
import type { AudioTranscriber } from '../domain/ports/audio-transcriber.port';
import type { ChatOrchestrator, OrchestratorOutput } from '../domain/ports/chat-orchestrator.port';
import type { ImageStorage } from '../domain/ports/image-storage.port';
import type { OcrService } from '../domain/ports/ocr.port';
import type { AuditService } from '@shared/audit/audit.service';
import type { CacheService } from '@shared/cache/cache.port';

/** Dependencies for the message sub-service. */
export interface ChatMessageServiceDeps {
  repository: ChatRepository;
  orchestrator: ChatOrchestrator;
  imageStorage: ImageStorage;
  audioTranscriber?: AudioTranscriber;
  cache?: CacheService;
  ocr?: OcrService;
  audit?: AuditService;
  userMemory?: UserMemoryService;
  knowledgeBase?: KnowledgeBaseService;
  dynamicArtKeywords?: ReadonlySet<string>;
  artTopicClassifier?: ArtTopicClassifier;
  onArtKeywordDiscovered?: (keyword: string, locale: string) => void;
}

/**
 * Extracts a search term for knowledge base lookup from conversation history or input text.
 * Searches for the last assistant message with a detected artwork title, falling back to input text if 3+ words.
 */
function extractSearchTerm(
  history: { role: string; metadata?: Record<string, unknown> | null }[],
  inputText?: string,
): string | null {
  // Search history for last assistant message with detectedArtwork.title
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role === 'assistant' && msg.metadata) {
      const meta = msg.metadata as { detectedArtwork?: { title?: string } };
      if (meta.detectedArtwork?.title) {
        return meta.detectedArtwork.title;
      }
    }
  }
  // Fallback: use input text if it has 3+ words
  if (inputText && inputText.split(/\s+/).length >= 3) {
    return inputText;
  }
  return null;
}

/**
 * Handles the message lifecycle: prepare, post, stream, and commit assistant responses.
 */
export class ChatMessageService {
  private readonly repository: ChatRepository;
  private readonly orchestrator: ChatOrchestrator;
  private readonly imageProcessor: ImageProcessingService;
  private readonly guardrail: GuardrailEvaluationService;
  private readonly audioTranscriber: AudioTranscriber;
  private readonly cache?: CacheService;
  private readonly userMemory?: UserMemoryService;
  private readonly knowledgeBase?: KnowledgeBaseService;

  constructor(deps: ChatMessageServiceDeps) {
    this.repository = deps.repository;
    this.orchestrator = deps.orchestrator;
    this.audioTranscriber = deps.audioTranscriber ?? new DisabledAudioTranscriber();
    this.cache = deps.cache;
    this.userMemory = deps.userMemory;
    this.knowledgeBase = deps.knowledgeBase;

    this.imageProcessor = new ImageProcessingService({
      imageStorage: deps.imageStorage,
      ocr: deps.ocr,
    });

    this.guardrail = new GuardrailEvaluationService({
      repository: deps.repository,
      audit: deps.audit,
      dynamicArtKeywords: deps.dynamicArtKeywords,
      artTopicClassifier: deps.artTopicClassifier,
      onArtKeywordDiscovered: deps.onArtKeywordDiscovered,
    });
  }

  /**
   * Shared pre-LLM logic: validates session, processes image, runs input guardrail, persists user message.
   *
   * @returns Either a 'ready' preparation or a 'refused' result (guardrail blocked input).
   */
  // eslint-disable-next-line max-lines-per-function, complexity -- message preparation covers image processing, guardrail evaluation, and persistence in a single pipeline
  private async prepareMessage(
    sessionId: string,
    input: PostMessageInput,
    _requestId?: string,
    currentUserId?: number,
  ): Promise<
    | {
        kind: 'ready';
        session: Awaited<ReturnType<typeof ensureSessionAccess>>;
        imageRef?: string;
        orchestratorImage?: PostMessageInput['image'];
        requestedLocale?: string;
        history: Awaited<ReturnType<ChatRepository['listSessionHistory']>>;
        redirectHint?: string;
        ownerId?: number;
        userMemoryBlock?: string;
        knowledgeBaseBlock?: string;
      }
    | {
        kind: 'refused';
        result: PostMessageResult;
      }
  > {
    const session = await ensureSessionAccess(sessionId, this.repository, currentUserId);
    const ownerId = session.user?.id;

    const text = input.text?.trim();
    if (text && text.length > env.llm.maxTextLength) {
      throw badRequest(`text must be <= ${String(env.llm.maxTextLength)} characters`);
    }

    if (!text && !input.image) {
      throw badRequest('Either text or image is required');
    }

    // Image processing (validation, decode, storage)
    let imageRef: string | undefined;
    let orchestratorImage: PostMessageInput['image'] | undefined;

    if (input.image) {
      const processed = await this.imageProcessor.processImage(
        input.image,
        sessionId,
        ownerId ?? currentUserId,
      );
      imageRef = processed.imageRef;
      orchestratorImage = processed.orchestratorImage;
    }

    // OCR injection guard
    if (orchestratorImage) {
      await this.imageProcessor.runOcrGuard(
        orchestratorImage,
        evaluateUserInputGuardrail,
        sessionId,
      );
    }

    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string fallback
    const requestedLocale = input.context?.locale?.trim() || session.locale || undefined;
    const historyBeforeMessage = await this.repository.listSessionHistory(
      sessionId,
      env.llm.maxHistoryMessages,
    );

    const userGuardrail = await this.guardrail.evaluateInput(
      text,
      historyBeforeMessage,
      requestedLocale,
    );

    await this.repository.persistMessage({
      sessionId,
      role: 'user',
      text,
      imageRef,
    });

    if (!userGuardrail.allow) {
      const result = await this.guardrail.handleInputBlock({
        sessionId,
        reason: userGuardrail.reason,
        requestedLocale,
        userId: ownerId,
      });
      return { kind: 'refused', result };
    }

    const history = await this.repository.listSessionHistory(sessionId, env.llm.maxHistoryMessages);

    // Fetch cross-session user memory + knowledge base prompt blocks (fail-open, parallel)
    let userMemoryBlock = '';
    let knowledgeBaseBlock = '';

    const searchTerm = extractSearchTerm(history, input.text?.trim());

    await Promise.all([
      this.userMemory && ownerId
        ? this.userMemory
            .getMemoryForPrompt(ownerId)
            .then((b: string) => {
              userMemoryBlock = b;
            })
            .catch(() => {
              /* fail-open */
            })
        : Promise.resolve(),
      this.knowledgeBase && searchTerm
        ? this.knowledgeBase
            .lookup(searchTerm)
            .then((b: string) => {
              knowledgeBaseBlock = b;
            })
            .catch(() => {
              /* fail-open */
            })
        : Promise.resolve(),
    ]);

    return {
      kind: 'ready',
      session,
      imageRef,
      orchestratorImage,
      requestedLocale,
      history,
      redirectHint: userGuardrail.redirectHint,
      ownerId,
      userMemoryBlock,
      knowledgeBaseBlock,
    };
  }

  /**
   * Persists the assistant response and returns the result. Shared by postMessage and postMessageStream.
   */
  // eslint-disable-next-line max-lines-per-function, max-params, complexity -- commits assistant response with guardrail, session updates, artwork matching, cache invalidation
  private async commitAssistantResponse(
    sessionId: string,
    session: Awaited<ReturnType<typeof ensureSessionAccess>>,
    aiResult: OrchestratorOutput,
    requestedLocale: string | undefined,
    history: Awaited<ReturnType<ChatRepository['listSessionHistory']>>,
    ownerId: number | undefined,
  ): Promise<PostMessageResult> {
    const outputCheck = this.guardrail.evaluateOutput({
      text: aiResult.text,
      history,
      metadata: aiResult.metadata,
      requestedLocale,
    });

    const assistantText = outputCheck.text;
    const assistantMetadata = outputCheck.metadata;

    const baseSessionUpdates = outputCheck.allowed
      ? computeSessionUpdates(session, assistantMetadata, 'pending')
      : undefined;

    // Normalize locale before persisting to avoid garbage in DB
    const normalizedLocale = requestedLocale ? resolveLocale([requestedLocale]) : undefined;
    const localeChanged = normalizedLocale && normalizedLocale !== resolveLocale([session.locale]);
    const sessionUpdates = localeChanged
      ? { ...baseSessionUpdates, locale: normalizedLocale }
      : baseSessionUpdates;

    const artworkMatch =
      outputCheck.allowed && aiResult.metadata.detectedArtwork
        ? {
            artworkId: aiResult.metadata.detectedArtwork.artworkId,
            title: aiResult.metadata.detectedArtwork.title,
            artist: aiResult.metadata.detectedArtwork.artist,
            confidence: aiResult.metadata.detectedArtwork.confidence,
            source: aiResult.metadata.detectedArtwork.source,
            room: aiResult.metadata.detectedArtwork.room,
          }
        : undefined;

    let assistantMessage;
    try {
      assistantMessage = await this.repository.persistMessage({
        sessionId,
        role: 'assistant',
        text: assistantText,
        metadata: assistantMetadata as Record<string, unknown>,
        sessionUpdates,
        artworkMatch,
      });
    } catch (error) {
      if ((error as Error).name === 'OptimisticLockVersionMismatchError') {
        throw conflict('Session was modified concurrently');
      }
      throw error;
    }

    if (outputCheck.allowed && sessionUpdates?.visitContext) {
      const pendingArtwork = sessionUpdates.visitContext.artworksDiscussed.find(
        (a) => a.messageId === 'pending',
      );
      if (pendingArtwork) {
        pendingArtwork.messageId = assistantMessage.id;
      }
    }

    if (this.cache) {
      await this.cache.delByPrefix(`session:${sessionId}:`);
      if (ownerId) {
        await this.cache.delByPrefix(`sessions:user:${String(ownerId)}:`);
      }
    }

    // Fire-and-forget: update cross-session user memory
    if (this.userMemory && ownerId && sessionUpdates?.visitContext) {
      this.userMemory
        .updateAfterSession(ownerId, sessionUpdates.visitContext, sessionId)
        .catch(() => {
          // swallowed — user memory is non-critical
        });
    }

    return {
      sessionId,
      message: {
        id: assistantMessage.id,
        role: 'assistant',
        text: assistantText,
        createdAt: assistantMessage.createdAt.toISOString(),
      },
      metadata: assistantMetadata,
    };
  }

  /** Posts a message and returns the assistant response (non-streaming). */
  async postMessage(
    sessionId: string,
    input: PostMessageInput,
    requestId?: string,
    currentUserId?: number,
  ): Promise<PostMessageResult> {
    const prep = await this.prepareMessage(sessionId, input, requestId, currentUserId);
    if (prep.kind === 'refused') return prep.result;

    const {
      session,
      orchestratorImage,
      requestedLocale,
      history,
      redirectHint,
      ownerId,
      userMemoryBlock,
      knowledgeBaseBlock,
    } = prep;
    const text = input.text?.trim();

    const aiResult: OrchestratorOutput = await this.orchestrator.generate({
      history,
      text,
      image: orchestratorImage,
      locale: requestedLocale,
      museumMode: input.context?.museumMode ?? session.museumMode,
      context: {
        location: input.context?.location,
        guideLevel: input.context?.guideLevel,
      },
      visitContext: session.visitContext,
      requestId,
      redirectHint,
      userMemoryBlock,
      knowledgeBaseBlock,
    });

    return await this.commitAssistantResponse(
      sessionId,
      session,
      aiResult,
      requestedLocale,
      history,
      ownerId,
    );
  }

  /** Posts a message with token-by-token streaming and incremental guardrail checks. */
  // eslint-disable-next-line max-lines-per-function, max-params -- streaming variant needs onToken, onGuardrail, signal callbacks alongside standard params
  async postMessageStream(
    sessionId: string,
    input: PostMessageInput,
    onToken: (text: string) => void,
    onGuardrail?: (text: string, reason: GuardrailBlockReason) => void,
    requestId?: string,
    currentUserId?: number,
    signal?: AbortSignal,
  ): Promise<PostMessageResult> {
    const prep = await this.prepareMessage(sessionId, input, requestId, currentUserId);
    if (prep.kind === 'refused') return prep.result;

    const {
      session,
      orchestratorImage,
      requestedLocale,
      history,
      redirectHint,
      ownerId,
      userMemoryBlock,
      knowledgeBaseBlock,
    } = prep;
    const text = input.text?.trim();

    if (signal?.aborted) {
      throw new AppError({ message: 'Request aborted', statusCode: 499, code: 'ABORTED' });
    }

    // Incremental guardrail state
    let accumulated = '';
    let artSignalSeen = false;
    let metaStarted = false;
    const META_MARKER = '\n[META]';

    const onChunk = (chunk: string) => {
      if (signal?.aborted) {
        throw new AppError({ message: 'Client disconnected', statusCode: 499, code: 'ABORTED' });
      }

      accumulated += chunk;

      let metaIdx = accumulated.indexOf(META_MARKER);
      if (metaIdx === -1) {
        // Fallback: LLM may omit the leading newline before [META]
        metaIdx = accumulated.indexOf('[META]');
      }
      if (metaIdx !== -1) {
        if (!metaStarted) {
          metaStarted = true;
          const prevLen = accumulated.length - chunk.length;
          const answerPartLen = metaIdx - prevLen;
          if (answerPartLen > 0) {
            onToken(chunk.slice(0, answerPartLen));
          }
        }
        return;
      }

      if (!artSignalSeen && accumulated.length % 50 < chunk.length) {
        const guardrailResult = this.guardrail.evaluateOutput({
          text: accumulated,
          history,
          metadata: {},
          requestedLocale,
        });
        if (guardrailResult.allowed) {
          artSignalSeen = true;
        } else if (accumulated.length > 100 && onGuardrail) {
          onGuardrail(guardrailResult.text, 'unsafe_output');
        }
      }

      onToken(chunk);
    };

    const aiResult: OrchestratorOutput = await this.orchestrator.generateStream(
      {
        history,
        text,
        image: orchestratorImage,
        locale: requestedLocale,
        museumMode: input.context?.museumMode ?? session.museumMode,
        context: {
          location: input.context?.location,
          guideLevel: input.context?.guideLevel,
        },
        visitContext: session.visitContext,
        requestId,
        redirectHint,
        userMemoryBlock,
        knowledgeBaseBlock,
      },
      onChunk,
    );

    return await this.commitAssistantResponse(
      sessionId,
      session,
      aiResult,
      requestedLocale,
      history,
      ownerId,
    );
  }

  /** Transcribes an audio message then delegates to postMessage for LLM processing. */
  async postAudioMessage(
    sessionId: string,
    input: PostAudioMessageInput,
    requestId?: string,
    currentUserId?: number,
  ): Promise<PostAudioMessageResult> {
    const session = await ensureSessionAccess(sessionId, this.repository, currentUserId);

    const audio = input.audio;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: audio fields may be undefined from external API input
    if (!audio?.base64?.trim()) {
      throw badRequest('Audio payload is required');
    }
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: mimeType may be undefined from external API input
    if (!audio.mimeType?.trim()) {
      throw badRequest('Audio mime type is required');
    }
    if (
      !Number.isFinite(audio.sizeBytes) ||
      audio.sizeBytes <= 0 ||
      audio.sizeBytes > env.llm.maxAudioBytes
    ) {
      throw badRequest(`Audio exceeds max size of ${String(env.llm.maxAudioBytes)} bytes`);
    }
    if (!env.upload.allowedAudioMimeTypes.includes(audio.mimeType)) {
      throw badRequest(`Unsupported audio mime type: ${audio.mimeType}`);
    }

    const transcription = await this.audioTranscriber.transcribe({
      base64: audio.base64,
      mimeType: audio.mimeType,
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string fallback
      locale: input.context?.locale || session.locale || undefined,
      requestId,
    });

    const response = await this.postMessage(
      sessionId,
      {
        text: transcription.text,
        context: input.context,
      },
      requestId,
      currentUserId,
    );

    return {
      ...response,
      transcription,
    };
  }
}
