import { env } from '@src/config/env';
import { logger } from '@shared/logger/logger';
import { AppError, badRequest, conflict, notFound } from '@shared/errors/app.error';
import { resolveLocale } from '@shared/i18n/locale';
import type { CacheService } from '@shared/cache/cache.port';
import {
  assertImageSize,
  assertMimeType,
  decodeBase64Image,
  isSafeImageUrl,
} from './image-input';
import {
  buildGuardrailRefusal,
  evaluateAssistantOutputGuardrail,
  evaluateUserInputGuardrail,
  GuardrailBlockReason,
} from './art-topic-guardrail';
import {
  ChatAssistantMetadata,
  CreateSessionInput,
  PostAudioMessageInput,
  MessagePageQuery,
  PostMessageInput,
  ReportReason,
} from '../domain/chat.types';
import { computeSessionUpdates } from './visit-context';
import {
  ChatRepository,
  ChatSessionsPage,
  SessionMessagesPage,
} from '../domain/chat.repository.interface';
import { ImageStorage } from '../adapters/secondary/image-storage.stub';
import {
  ChatOrchestrator,
  OrchestratorOutput,
} from '../adapters/secondary/langchain.orchestrator';
import {
  AudioTranscriber,
  DisabledAudioTranscriber,
} from '../adapters/secondary/audio-transcriber.openai';
import type { TextToSpeechService } from '../adapters/secondary/text-to-speech.openai';
import type { OcrService } from '../adapters/secondary/ocr-service';
import { ensureSessionAccess, ensureMessageAccess } from './session-access';
import {
  isValidSessionListCursor,
  buildChatImageObjectKey,
  withPolicyCitation,
  resolveLocalImageMeta,
} from './chat-image.helpers';

import type { AuditService } from '@shared/audit/audit.service';
import { AUDIT_SECURITY_GUARDRAIL_BLOCK } from '@shared/audit/audit.types';
import type { UserMemoryService } from './user-memory.service';

/** Dependencies for constructing a ChatService instance. */
export interface ChatServiceDeps {
  repository: ChatRepository;
  orchestrator: ChatOrchestrator;
  imageStorage: ImageStorage;
  audioTranscriber?: AudioTranscriber;
  tts?: TextToSpeechService;
  cache?: CacheService;
  ocr?: OcrService;
  audit?: AuditService;
  userMemory?: UserMemoryService;
}

/** Returned after a new chat session is created. */
export interface CreateSessionResult {
  id: string;
  locale?: string | null;
  museumMode: boolean;
  title?: string | null;
  museumName?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Returned after a user message is processed and the assistant replies. */
export interface PostMessageResult {
  sessionId: string;
  message: {
    id: string;
    role: 'assistant';
    text: string;
    createdAt: string;
  };
  metadata: ChatAssistantMetadata;
}

/** Extends {@link PostMessageResult} with the speech-to-text transcription details. */
export interface PostAudioMessageResult extends PostMessageResult {
  transcription: {
    text: string;
    model: string;
    provider: 'openai';
  };
}

/** Returned after attempting to delete an empty session. */
export interface DeleteSessionResult {
  sessionId: string;
  deleted: boolean;
}

/** Returned after a user reports an assistant message. */
export interface ReportMessageResult {
  messageId: string;
  reported: boolean;
}

/** A single session with its paginated messages. */
export interface SessionResult {
  session: CreateSessionResult;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system';
    text?: string | null;
    imageRef?: string | null;
    image?: {
      url: string;
      expiresAt: string;
    } | null;
    createdAt: string;
    metadata?: Record<string, unknown> | null;
  }>;
  page: {
    nextCursor: string | null;
    hasMore: boolean;
    limit: number;
  };
}

/** Paginated list of sessions for a given user, each with a message preview. */
export interface ListSessionsResult {
  sessions: Array<{
    id: string;
    locale?: string | null;
    museumMode: boolean;
    title?: string | null;
    museumName?: string | null;
    createdAt: string;
    updatedAt: string;
    preview?: {
      text: string;
      createdAt: string;
      role: 'user' | 'assistant' | 'system';
    };
    messageCount: number;
  }>;
  page: {
    nextCursor: string | null;
    hasMore: boolean;
    limit: number;
  };
}

/**
 * Orchestrates the chat lifecycle: session CRUD, message posting with guardrails,
 * image upload/storage, audio transcription, LLM orchestration, and message reporting.
 */
export class ChatService {
  private readonly repository: ChatRepository;
  private readonly orchestrator: ChatOrchestrator;
  private readonly imageStorage: ImageStorage;
  private readonly audioTranscriber: AudioTranscriber;
  private readonly tts?: TextToSpeechService;
  private readonly cache?: CacheService;
  private readonly ocr?: OcrService;
  private readonly audit?: AuditService;
  private readonly userMemory?: UserMemoryService;

  constructor(deps: ChatServiceDeps) {
    this.repository = deps.repository;
    this.orchestrator = deps.orchestrator;
    this.imageStorage = deps.imageStorage;
    this.audioTranscriber = deps.audioTranscriber ?? new DisabledAudioTranscriber();
    this.tts = deps.tts;
    this.cache = deps.cache;
    this.ocr = deps.ocr;
    this.audit = deps.audit;
    this.userMemory = deps.userMemory;
  }

  /**
   * Creates a new chat session.
   * @param input - Session creation parameters (userId, locale, museumMode).
   * @returns The newly created session.
   * @throws {AppError} 400 if userId is not a positive integer.
   */
  async createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
    if (input.userId !== undefined && (!Number.isInteger(input.userId) || input.userId <= 0)) {
      throw badRequest('userId must be a positive integer');
    }

    const session = await this.repository.createSession({
      userId: input.userId,
      locale: input.locale,
      museumMode: input.museumMode,
      museumId: input.museumId,
    });

    // Invalidate session list cache so new session appears immediately
    if (this.cache && input.userId) {
      await this.cache.delByPrefix(`sessions:user:${input.userId}:`);
    }

    return {
      id: session.id,
      locale: session.locale,
      museumMode: session.museumMode,
      title: session.title ?? null,
      museumName: session.museumName ?? null,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    };
  }

  /**
   * Shared pre-LLM logic: validates session, processes image, runs input guardrail, persists user message.
   * @returns Either a 'ready' preparation or a 'refused' result (guardrail blocked input).
   */
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
      throw badRequest(`text must be <= ${env.llm.maxTextLength} characters`);
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
        assertImageSize(sizeBytes as number, env.llm.maxImageBytes);

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
          const ocrGuardrail = evaluateUserInputGuardrail({ text: ocrResult.text, history: [] });
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

    const requestedLocale = input.context?.locale?.trim() || session.locale || undefined;
    const historyBeforeMessage = await this.repository.listSessionHistory(
      sessionId,
      env.llm.maxHistoryMessages,
    );
    const userGuardrail = evaluateUserInputGuardrail({
      text,
      history: historyBeforeMessage,
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

    const history = await this.repository.listSessionHistory(
      sessionId,
      env.llm.maxHistoryMessages,
    );

    // Fetch cross-session user memory prompt block (fail-open)
    let userMemoryBlock = '';
    if (this.userMemory && ownerId) {
      try {
        userMemoryBlock = await this.userMemory.getMemoryForPrompt(ownerId);
      } catch {
        // fail-open: memory enrichment is non-critical
      }
    }

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
    };
  }

  /**
   * Persists the assistant response and returns the result. Shared by postMessage and postMessageStream.
   */
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

    if (outputGuardrail.allow && sessionUpdates) {
      if (sessionUpdates.visitContext) {
        const pendingArtwork = sessionUpdates.visitContext.artworksDiscussed.find(
          (a) => a.messageId === 'pending',
        );
        if (pendingArtwork) {
          pendingArtwork.messageId = assistantMessage.id;
        }
      }
    }

    if (this.cache) {
      await this.cache.delByPrefix(`session:${sessionId}:`);
      if (ownerId) {
        await this.cache.delByPrefix(`sessions:user:${ownerId}:`);
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

    const { session, orchestratorImage, requestedLocale, history, redirectHint, ownerId, userMemoryBlock } = prep;
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
    });

    return this.commitAssistantResponse(sessionId, session, aiResult, requestedLocale, history, ownerId);
  }

  /**
   * Streams assistant response tokens via onToken callback while processing the message.
   * Uses shared prepareMessage/commitAssistantResponse logic.
   * @param sessionId - UUID of the target chat session.
   * @param input - User message payload (text only for streaming).
   * @param onToken - Called with each text token as it streams from the LLM.
   * @param onGuardrail - Called when the output guardrail blocks mid-stream.
   * @param requestId - Optional correlation id for tracing.
   * @param currentUserId - Authenticated user id for ownership checks.
   * @param signal - AbortSignal to cancel the stream (e.g. on client disconnect).
   * @returns The assistant's reply with metadata.
   */
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

    const { session, orchestratorImage, requestedLocale, history, redirectHint, ownerId, userMemoryBlock } = prep;
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
        } else if (!guardrail.allow && accumulated.length > 100) {
          // Guardrail blocking — notify caller
          if (onGuardrail && guardrail.reason) {
            const refusalText = buildGuardrailRefusal(requestedLocale, guardrail.reason);
            onGuardrail(refusalText, guardrail.reason);
          }
          // Don't throw — let the stream complete so we can handle it in commitAssistantResponse
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
      },
      onChunk,
    );

    return this.commitAssistantResponse(sessionId, session, aiResult, requestedLocale, history, ownerId);
  }

  /**
   * Transcribes an audio message to text, then delegates to {@link postMessage}.
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
    if (!audio?.base64?.trim()) {
      throw badRequest('Audio payload is required');
    }
    if (!audio.mimeType?.trim()) {
      throw badRequest('Audio mime type is required');
    }
    if (
      !Number.isFinite(audio.sizeBytes) ||
      audio.sizeBytes <= 0 ||
      audio.sizeBytes > env.llm.maxAudioBytes
    ) {
      throw badRequest(`Audio exceeds max size of ${env.llm.maxAudioBytes} bytes`);
    }
    if (!env.upload.allowedAudioMimeTypes.includes(audio.mimeType)) {
      throw badRequest(`Unsupported audio mime type: ${audio.mimeType}`);
    }

    const transcription = await this.audioTranscriber.transcribe({
      base64: audio.base64,
      mimeType: audio.mimeType,
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

  /**
   * Deletes a session only if it contains no messages.
   * @param sessionId - UUID of the session to delete.
   * @param currentUserId - Authenticated user id for ownership checks.
   * @returns Whether the session was actually deleted.
   * @throws {AppError} 400 on invalid id, 404 if session not found or not owned.
   */
  async deleteSessionIfEmpty(
    sessionId: string,
    currentUserId?: number,
  ): Promise<DeleteSessionResult> {
    const session = await ensureSessionAccess(sessionId, this.repository, currentUserId);

    const deleted = await this.repository.deleteSessionIfEmpty(sessionId);

    if (deleted && this.cache) {
      await this.cache.delByPrefix(`session:${sessionId}:`);
      if (session.user?.id) {
        await this.cache.delByPrefix(`sessions:user:${session.user.id}:`);
      }
    }

    return {
      sessionId,
      deleted,
    };
  }

  /**
   * Retrieves a session with its paginated messages.
   * @param sessionId - UUID of the session to retrieve.
   * @param page - Cursor-based pagination parameters (limit, cursor).
   * @param currentUserId - Authenticated user id for ownership checks.
   * @returns The session details and a page of messages.
   * @throws {AppError} 400 on invalid id, 404 if session not found or not owned.
   */
  async getSession(
    sessionId: string,
    page: MessagePageQuery,
    currentUserId?: number,
  ): Promise<SessionResult> {
    const session = await ensureSessionAccess(sessionId, this.repository, currentUserId);

    const limit = Math.max(1, Math.min(page.limit || 20, 50));
    const cacheKey = `session:${sessionId}:${page.cursor ?? 'first'}:${limit}`;

    if (this.cache) {
      const cached = await this.cache.get<SessionResult>(cacheKey);
      if (cached) return cached;
    }

    const rows: SessionMessagesPage = await this.repository.listSessionMessages({
      sessionId,
      limit,
      cursor: page.cursor,
    });

    const result: SessionResult = {
      session: {
        id: session.id,
        locale: session.locale,
        museumMode: session.museumMode,
        title: session.title ?? null,
        museumName: session.museumName ?? null,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
      },
      messages: rows.messages.map((message) => ({
        id: message.id,
        role: message.role,
        text: message.text,
        imageRef: message.imageRef,
        image: null,
        createdAt: message.createdAt.toISOString(),
        metadata: message.metadata,
      })),
      page: {
        nextCursor: rows.nextCursor,
        hasMore: rows.hasMore,
        limit,
      },
    };

    if (this.cache) {
      await this.cache.set(cacheKey, result, env.cache?.sessionTtlSeconds ?? 3600);
    }

    return result;
  }

  /**
   * Lists all sessions for the authenticated user with cursor-based pagination.
   * @param page - Cursor-based pagination parameters (limit, cursor).
   * @param currentUserId - Authenticated user id (required).
   * @returns Paginated sessions with message previews.
   * @throws {AppError} 400 if userId is missing/invalid or cursor is malformed.
   */
  async listSessions(
    page: MessagePageQuery,
    currentUserId?: number,
  ): Promise<ListSessionsResult> {
    if (!Number.isInteger(currentUserId) || Number(currentUserId) <= 0) {
      throw badRequest('Authenticated user id is required');
    }
    const userId = currentUserId as number;

    if (page.cursor && !isValidSessionListCursor(page.cursor)) {
      throw badRequest('Invalid cursor format');
    }

    const limit = Math.max(1, Math.min(page.limit || 20, 50));
    const cacheKey = `sessions:user:${userId}:${page.cursor ?? 'first'}:${limit}`;

    if (this.cache) {
      const cached = await this.cache.get<ListSessionsResult>(cacheKey);
      if (cached) return cached;
    }

    const rows: ChatSessionsPage = await this.repository.listSessions({
      userId,
      limit,
      cursor: page.cursor,
    });

    const result: ListSessionsResult = {
      sessions: rows.sessions.map((row) => ({
        id: row.session.id,
        locale: row.session.locale,
        museumMode: row.session.museumMode,
        title: row.session.title ?? null,
        museumName: row.session.museumName ?? null,
        createdAt: row.session.createdAt.toISOString(),
        updatedAt: row.session.updatedAt.toISOString(),
        preview: row.preview
          ? {
              text: row.preview.text || '[Image message]',
              createdAt: row.preview.createdAt.toISOString(),
              role: row.preview.role,
            }
          : undefined,
        messageCount: row.messageCount,
      })),
      page: {
        nextCursor: rows.nextCursor,
        hasMore: rows.hasMore,
        limit,
      },
    };

    if (this.cache) {
      await this.cache.set(cacheKey, result, env.cache?.listTtlSeconds ?? 300);
    }

    return result;
  }

  /**
   * Resolves the image reference for a message, including local file name and content type when applicable.
   * @param messageId - UUID of the message containing the image.
   * @param currentUserId - Authenticated user id for ownership checks.
   * @returns The image reference, and optionally the local file name and content type.
   * @throws {AppError} 400 on invalid id, 404 if message or image not found.
   */
  async getMessageImageRef(
    messageId: string,
    currentUserId?: number,
  ): Promise<{
    imageRef: string;
    fileName?: string;
    contentType?: string;
  }> {
    const row = await ensureMessageAccess(messageId, this.repository, currentUserId);

    if (!row.message.imageRef) {
      throw notFound('Chat message image not found');
    }

    const localMeta = resolveLocalImageMeta(row.message.imageRef);
    if (localMeta) {
      return { imageRef: row.message.imageRef, ...localMeta };
    }

    return {
      imageRef: row.message.imageRef,
    };
  }

  /**
   * Reports an assistant message for moderation.
   * @param messageId - UUID of the assistant message to report.
   * @param reason - Reason for the report (offensive, inaccurate, inappropriate, other).
   * @param currentUserId - Authenticated user id filing the report.
   * @param comment - Optional free-text comment.
   * @returns Confirmation that the message was reported.
   * @throws {AppError} 400 on invalid id/reason or non-assistant message, 404 if not found.
   */
  async reportMessage(
    messageId: string,
    reason: ReportReason,
    currentUserId: number,
    comment?: string,
  ): Promise<ReportMessageResult> {
    const allowedReasons: ReportReason[] = ['offensive', 'inaccurate', 'inappropriate', 'other'];
    if (!allowedReasons.includes(reason)) {
      throw badRequest('Invalid report reason');
    }

    const row = await ensureMessageAccess(messageId, this.repository, currentUserId);

    if (row.message.role !== 'assistant') {
      throw badRequest('Only assistant messages can be reported');
    }

    const alreadyReported = await this.repository.hasMessageReport(messageId, currentUserId);
    if (alreadyReported) {
      return { messageId, reported: true };
    }

    await this.repository.persistMessageReport({
      messageId,
      userId: currentUserId,
      reason,
      comment,
    });

    return { messageId, reported: true };
  }

  /**
   * Synthesizes speech from an assistant message's text content.
   * @param messageId - UUID of the assistant message to synthesize.
   * @param currentUserId - Authenticated user id for ownership checks.
   * @returns Audio buffer with content type, or null if the message has no text.
   * @throws {AppError} 400 if the message is not from the assistant.
   * @throws {AppError} 501 if TTS is not available.
   * @throws {AppError} 404 if message not found or not owned.
   */
  async synthesizeSpeech(
    messageId: string,
    currentUserId?: number,
  ): Promise<{ audio: Buffer; contentType: string } | null> {
    const row = await ensureMessageAccess(messageId, this.repository, currentUserId);

    if (row.message.role !== 'assistant') {
      throw badRequest('TTS is only available for assistant messages');
    }

    if (!row.message.text?.trim()) {
      return null;
    }

    if (!this.tts) {
      throw new AppError({
        message: 'Text-to-speech is not available',
        statusCode: 501,
        code: 'FEATURE_UNAVAILABLE',
      });
    }

    const cacheKey = `tts:${messageId}`;
    if (this.cache) {
      const cached = await this.cache.get<{ audio: string; contentType: string }>(cacheKey);
      if (cached) {
        return { audio: Buffer.from(cached.audio, 'base64'), contentType: cached.contentType };
      }
    }

    const result = await this.tts.synthesize({ text: row.message.text });

    if (this.cache) {
      await this.cache.set(
        cacheKey,
        { audio: result.audio.toString('base64'), contentType: result.contentType },
        env.tts?.cacheTtlSeconds ?? 86400,
      );
    }

    return result;
  }
}
