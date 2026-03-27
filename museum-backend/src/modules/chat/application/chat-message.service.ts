/* eslint-disable max-lines -- message service covers prepare, commit, post, stream, and audio workflows */
import { AUDIT_SECURITY_GUARDRAIL_BLOCK } from '@shared/audit/audit.types';
import { AppError, badRequest, conflict } from '@shared/errors/app.error';
import { resolveLocale } from '@shared/i18n/locale';
import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import {
  buildGuardrailRefusal,
  evaluateAssistantOutputGuardrail,
  evaluateUserInputGuardrail,
  type GuardrailBlockReason,
} from './art-topic-guardrail';
import { buildChatImageObjectKey, withPolicyCitation } from './chat-image.helpers';
import { assertImageSize, assertMimeType, decodeBase64Image, isSafeImageUrl } from './image-input';
import { ensureSessionAccess } from './session-access';
import { computeSessionUpdates } from './visit-context';
import { DisabledAudioTranscriber } from '../domain/ports/audio-transcriber.port';

import type { ArtTopicClassifier } from './art-topic-classifier';
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
  private readonly imageStorage: ImageStorage;
  private readonly audioTranscriber: AudioTranscriber;
  private readonly cache?: CacheService;
  private readonly ocr?: OcrService;
  private readonly audit?: AuditService;
  private readonly userMemory?: UserMemoryService;
  private readonly knowledgeBase?: KnowledgeBaseService;
  private readonly dynamicArtKeywords?: ReadonlySet<string>;
  private readonly artTopicClassifier?: ArtTopicClassifier;
  private readonly onArtKeywordDiscovered?: (keyword: string, locale: string) => void;

  constructor(deps: ChatMessageServiceDeps) {
    this.repository = deps.repository;
    this.orchestrator = deps.orchestrator;
    this.imageStorage = deps.imageStorage;
    this.audioTranscriber = deps.audioTranscriber ?? new DisabledAudioTranscriber();
    this.cache = deps.cache;
    this.ocr = deps.ocr;
    this.audit = deps.audit;
    this.userMemory = deps.userMemory;
    this.knowledgeBase = deps.knowledgeBase;
    this.dynamicArtKeywords = deps.dynamicArtKeywords;
    this.artTopicClassifier = deps.artTopicClassifier;
    this.onArtKeywordDiscovered = deps.onArtKeywordDiscovered;
  }

  /**
   * Shared pre-LLM logic: validates session, processes image, runs input guardrail, persists user message.
   *
   * @returns Either a 'ready' preparation or a 'refused' result (guardrail blocked input).
   */
  // eslint-disable-next-line max-lines-per-function, complexity, sonarjs/cognitive-complexity -- message preparation covers image processing, guardrail evaluation, and persistence in a single pipeline
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

    let imageRef: string | undefined;
    let orchestratorImage: PostMessageInput['image'] | undefined;

    if (input.image) {
      if (input.image.source === 'url') {
        if (!isSafeImageUrl(input.image.value)) {
          throw badRequest('Image URL must be a safe HTTPS URL');
        }

        imageRef = input.image.value;
        orchestratorImage = input.image;
      } else if (input.image.source === 'upload') {
        const normalizedBase64 = input.image.value.replace(/\s/g, '');
        const mimeType = input.image.mimeType;
        const sizeBytes = input.image.sizeBytes;

        if (!mimeType || typeof mimeType !== 'string') {
          throw badRequest('Uploaded image mime type is required');
        }
        if (!Number.isFinite(sizeBytes)) {
          throw badRequest('Uploaded image size is required');
        }

        assertMimeType(mimeType, env.upload.allowedMimeTypes);
        assertImageSize(sizeBytes ?? 0, env.llm.maxImageBytes);

        imageRef = await this.imageStorage.save({
          base64: normalizedBase64,
          mimeType,
          objectKey: buildChatImageObjectKey({
            mimeType,
            sessionId,
            userId: ownerId ?? currentUserId,
          }),
        });

        orchestratorImage = {
          source: 'upload',
          value: normalizedBase64,
          mimeType,
          sizeBytes,
        };
      } else {
        const decoded = decodeBase64Image(input.image.value);
        assertMimeType(decoded.mimeType, env.upload.allowedMimeTypes);
        assertImageSize(decoded.sizeBytes, env.llm.maxImageBytes);

        imageRef = await this.imageStorage.save({
          base64: decoded.base64,
          mimeType: decoded.mimeType,
          objectKey: buildChatImageObjectKey({
            mimeType: decoded.mimeType,
            sessionId,
            userId: ownerId ?? currentUserId,
          }),
        });

        orchestratorImage = {
          source: input.image.source,
          value: decoded.base64,
          mimeType: decoded.mimeType,
          sizeBytes: decoded.sizeBytes,
        };
      }
    }

    // OCR injection guard: extract text from image and run through input guardrail
    if (this.ocr && orchestratorImage) {
      try {
        const ocrResult = await this.ocr.extractText(orchestratorImage.value);
        if (ocrResult?.text) {
          const ocrGuardrail = await evaluateUserInputGuardrail({
            text: ocrResult.text,
            history: [],
          });
          if (!ocrGuardrail.allow) {
            throw badRequest('Image contains disallowed content');
          }
        }
      } catch (error) {
        // Fail-open: if OCR itself fails, let the request proceed (AppError from guardrail re-thrown)
        if (error instanceof AppError) throw error;
        logger.warn('ocr_guard_fail_open', {
          error: error instanceof Error ? error.message : String(error),
          sessionId,
        });
      }
    }

    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string fallback
    const requestedLocale = input.context?.locale?.trim() || session.locale || undefined;
    const historyBeforeMessage = await this.repository.listSessionHistory(
      sessionId,
      env.llm.maxHistoryMessages,
    );
    const userGuardrail = await evaluateUserInputGuardrail({
      text,
      history: historyBeforeMessage,
      dynamicKeywords: this.dynamicArtKeywords,
      classifier: this.artTopicClassifier,
      onKeywordDiscovered: this.onArtKeywordDiscovered
        ? (kw: string) => {
            this.onArtKeywordDiscovered?.(kw, requestedLocale ?? 'en');
          }
        : undefined,
    });

    await this.repository.persistMessage({
      sessionId,
      role: 'user',
      text,
      imageRef,
    });

    if (!userGuardrail.allow) {
      this.audit?.log({
        action: AUDIT_SECURITY_GUARDRAIL_BLOCK,
        actorType: session.user?.id ? 'user' : 'anonymous',
        actorId: session.user?.id ?? null,
        targetType: 'session',
        targetId: sessionId,
        metadata: { reason: userGuardrail.reason },
      });

      const refusalText = buildGuardrailRefusal(requestedLocale, userGuardrail.reason);
      const refusalMetadata = withPolicyCitation({}, userGuardrail.reason);
      const assistantMessage = await this.repository.persistMessage({
        sessionId,
        role: 'assistant',
        text: refusalText,
        metadata: refusalMetadata as Record<string, unknown>,
      });

      return {
        kind: 'refused',
        result: {
          sessionId,
          message: {
            id: assistantMessage.id,
            role: 'assistant',
            text: refusalText,
            createdAt: assistantMessage.createdAt.toISOString(),
          },
          metadata: refusalMetadata,
        },
      };
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
    const outputGuardrail = evaluateAssistantOutputGuardrail({
      text: aiResult.text,
      history,
    });
    const assistantText = outputGuardrail.allow
      ? aiResult.text
      : buildGuardrailRefusal(requestedLocale, outputGuardrail.reason);
    const assistantMetadata = outputGuardrail.allow
      ? aiResult.metadata
      : withPolicyCitation(aiResult.metadata, outputGuardrail.reason);

    const baseSessionUpdates = outputGuardrail.allow
      ? computeSessionUpdates(session, assistantMetadata, 'pending')
      : undefined;

    // Normalize locale before persisting to avoid garbage in DB
    const normalizedLocale = requestedLocale ? resolveLocale([requestedLocale]) : undefined;
    const localeChanged = normalizedLocale && normalizedLocale !== resolveLocale([session.locale]);
    const sessionUpdates = localeChanged
      ? { ...baseSessionUpdates, locale: normalizedLocale }
      : baseSessionUpdates;

    const artworkMatch =
      outputGuardrail.allow && aiResult.metadata.detectedArtwork
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

    if (outputGuardrail.allow && sessionUpdates?.visitContext) {
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

  /**
   * Processes a user text/image message: runs input guardrail, persists the user message,
   * invokes the LLM orchestrator, applies the output guardrail, and persists the assistant reply.
   *
   * @param sessionId - UUID of the target chat session.
   * @param input - User message payload (text and/or image).
   * @param requestId - Optional correlation id for tracing.
   * @param currentUserId - Authenticated user id for ownership checks.
   * @returns The assistant's reply with metadata.
   * @throws {AppError} 400 on invalid input, 404 if session not found, 409 on optimistic lock conflict.
   */
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

  /**
   * Streams assistant response tokens via onToken callback while processing the message.
   * Uses shared prepareMessage/commitAssistantResponse logic.
   *
   * @param sessionId - UUID of the target chat session.
   * @param input - User message payload (text only for streaming).
   * @param onToken - Called with each text token as it streams from the LLM.
   * @param onGuardrail - Called when the output guardrail blocks mid-stream.
   * @param requestId - Optional correlation id for tracing.
   * @param currentUserId - Authenticated user id for ownership checks.
   * @param signal - AbortSignal to cancel the stream (e.g. on client disconnect).
   * @returns The assistant's reply with metadata.
   */
  // eslint-disable-next-line max-params, max-lines-per-function -- streaming requires callbacks, abort signal, and user context alongside core message parameters
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
      // Abort LLM stream when client disconnects (throws inside for-await loop)
      if (signal?.aborted) {
        throw new AppError({ message: 'Client disconnected', statusCode: 499, code: 'ABORTED' });
      }

      accumulated += chunk;

      // Check if we've hit the [META] delimiter
      const metaIdx = accumulated.indexOf(META_MARKER);
      if (metaIdx !== -1) {
        if (!metaStarted) {
          metaStarted = true;
          // Emit the answer-text portion of this chunk that falls before [META]
          const prevLen = accumulated.length - chunk.length;
          const answerPartLen = metaIdx - prevLen;
          if (answerPartLen > 0) {
            onToken(chunk.slice(0, answerPartLen));
          }
        }
        // Don't emit chunks after [META] — it's metadata JSON
        return;
      }

      // Run incremental guardrail every ~50 chars if art signal not yet seen
      if (!artSignalSeen && accumulated.length % 50 < chunk.length) {
        const guardrail = evaluateAssistantOutputGuardrail({ text: accumulated, history });
        if (guardrail.allow) {
          artSignalSeen = true;
        } else if (
          accumulated.length > 100 && // Guardrail blocking — notify caller
          onGuardrail &&
          guardrail.reason
        ) {
          const refusalText = buildGuardrailRefusal(requestedLocale, guardrail.reason);
          onGuardrail(refusalText, guardrail.reason);
        }
        // Don't throw — let the stream complete so we can handle it in commitAssistantResponse
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

  /**
   * Transcribes an audio message to text, then delegates to {@link postMessage}.
   *
   * @param sessionId - UUID of the target chat session.
   * @param input - Audio payload with base64 data, mime type, and size.
   * @param requestId - Optional correlation id for tracing.
   * @param currentUserId - Authenticated user id for ownership checks.
   * @returns The assistant's reply plus the transcription details.
   * @throws {AppError} 400 on invalid audio input, 404 if session not found.
   */
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
