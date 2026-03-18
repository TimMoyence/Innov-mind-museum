import { validate as isUuid } from 'uuid';
import path from 'path';
import { randomUUID } from 'crypto';

import { env } from '@src/config/env';
import { badRequest, conflict, notFound } from '@shared/errors/app.error';
import {
  assertImageSize,
  assertMimeType,
  decodeBase64Image,
  isSafeImageUrl,
} from './image-input';
import {
  buildGuardrailCitation,
  buildGuardrailRefusal,
  evaluateAssistantOutputGuardrail,
  evaluateUserInputGuardrail,
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

const isValidSessionListCursor = (value: string): boolean => {
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as unknown;

    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as Record<string, unknown>).updatedAt === 'string' &&
      typeof (parsed as Record<string, unknown>).id === 'string'
    );
  } catch {
    return false;
  }
};

const imageExtensionByMimeType: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const localImageRefPattern = /^local:\/\/([a-zA-Z0-9._-]+)$/;

const toLocalImageFileName = (imageRef: string): string | null => {
  const match = imageRef.match(localImageRefPattern);
  return match?.[1] || null;
};

const sanitizeObjectKeySegment = (value: string): string => {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
};

const buildChatImageObjectKey = (params: {
  mimeType: string;
  sessionId: string;
  userId?: number;
  now?: Date;
}): string => {
  const extension = imageExtensionByMimeType[params.mimeType] || 'img';
  const now = params.now || new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const userSegment =
    typeof params.userId === 'number' && Number.isInteger(params.userId) && params.userId > 0
      ? `user-${params.userId}`
      : 'user-anonymous';
  const sessionSegment = `session-${sanitizeObjectKeySegment(params.sessionId)}`;

  return [
    'chat-images',
    yyyy,
    mm,
    userSegment,
    sessionSegment,
    `${randomUUID()}.${extension}`,
  ].join('/');
};

const withPolicyCitation = (
  metadata: ChatAssistantMetadata,
  reason?: Parameters<typeof buildGuardrailCitation>[0],
): ChatAssistantMetadata => {
  const policyCitation = buildGuardrailCitation(reason);
  if (!policyCitation) {
    return metadata;
  }

  const citations = metadata.citations ? [...metadata.citations] : [];
  if (!citations.includes(policyCitation)) {
    citations.push(policyCitation);
  }

  return {
    ...metadata,
    citations,
  };
};

/**
 * Orchestrates the chat lifecycle: session CRUD, message posting with guardrails,
 * image upload/storage, audio transcription, LLM orchestration, and message reporting.
 */
export class ChatService {
  constructor(
    private readonly repository: ChatRepository,
    private readonly orchestrator: ChatOrchestrator,
    private readonly imageStorage: ImageStorage,
    private readonly audioTranscriber: AudioTranscriber = new DisabledAudioTranscriber(),
  ) {}

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
    });

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
    if (!isUuid(sessionId)) {
      throw badRequest('Invalid session id format');
    }

    const session = await this.repository.getSessionById(sessionId);
    if (!session) {
      throw notFound('Chat session not found');
    }
    const ownerId = session.user?.id;
    if (ownerId && currentUserId && ownerId !== currentUserId) {
      throw notFound('Chat session not found');
    }

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
      const refusalText = buildGuardrailRefusal(requestedLocale, userGuardrail.reason);
      const refusalMetadata = withPolicyCitation({}, userGuardrail.reason);
      const assistantMessage = await this.repository.persistMessage({
        sessionId,
        role: 'assistant',
        text: refusalText,
        metadata: refusalMetadata as Record<string, unknown>,
      });

      return {
        sessionId,
        message: {
          id: assistantMessage.id,
          role: 'assistant',
          text: refusalText,
          createdAt: assistantMessage.createdAt.toISOString(),
        },
        metadata: refusalMetadata,
      };
    }

    const history = await this.repository.listSessionHistory(
      sessionId,
      env.llm.maxHistoryMessages,
    );

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
      redirectHint: userGuardrail.redirectHint,
    });

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

    const sessionUpdates = outputGuardrail.allow
      ? computeSessionUpdates(session, assistantMetadata, 'pending')
      : undefined;

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
    if (!isUuid(sessionId)) {
      throw badRequest('Invalid session id format');
    }

    const session = await this.repository.getSessionById(sessionId);
    if (!session) {
      throw notFound('Chat session not found');
    }

    const ownerId = session.user?.id;
    if (ownerId && currentUserId && ownerId !== currentUserId) {
      throw notFound('Chat session not found');
    }

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
    if (!isUuid(sessionId)) {
      throw badRequest('Invalid session id format');
    }

    const session = await this.repository.getSessionById(sessionId);
    if (!session) {
      throw notFound('Chat session not found');
    }

    const ownerId = session.user?.id;
    if (ownerId && currentUserId && ownerId !== currentUserId) {
      throw notFound('Chat session not found');
    }

    const deleted = await this.repository.deleteSessionIfEmpty(sessionId);
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
    if (!isUuid(sessionId)) {
      throw badRequest('Invalid session id format');
    }

    const session = await this.repository.getSessionById(sessionId);
    if (!session) {
      throw notFound('Chat session not found');
    }
    const ownerId = session.user?.id;
    if (ownerId && currentUserId && ownerId !== currentUserId) {
      throw notFound('Chat session not found');
    }

    const limit = Math.max(1, Math.min(page.limit || 20, 50));

    const rows: SessionMessagesPage = await this.repository.listSessionMessages({
      sessionId,
      limit,
      cursor: page.cursor,
    });

    return {
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

    const rows: ChatSessionsPage = await this.repository.listSessions({
      userId,
      limit,
      cursor: page.cursor,
    });

    return {
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
    if (!isUuid(messageId)) {
      throw badRequest('Invalid message id format');
    }

    const row = await this.repository.getMessageById(messageId);
    if (!row) {
      throw notFound('Chat message not found');
    }

    const ownerId = row.session.user?.id;
    if (ownerId && currentUserId && ownerId !== currentUserId) {
      throw notFound('Chat message not found');
    }

    if (!row.message.imageRef) {
      throw notFound('Chat message image not found');
    }

    const fileName = toLocalImageFileName(row.message.imageRef);
    if (fileName) {
      const extension = path.extname(fileName).replace('.', '').toLowerCase();
      const contentType = Object.entries(imageExtensionByMimeType).find(
        ([, ext]) => ext === extension,
      )?.[0];
      return {
        imageRef: row.message.imageRef,
        fileName,
        contentType,
      };
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
    if (!isUuid(messageId)) {
      throw badRequest('Invalid message id format');
    }

    const allowedReasons: ReportReason[] = ['offensive', 'inaccurate', 'inappropriate', 'other'];
    if (!allowedReasons.includes(reason)) {
      throw badRequest('Invalid report reason');
    }

    const row = await this.repository.getMessageById(messageId);
    if (!row) {
      throw notFound('Chat message not found');
    }

    const ownerId = row.session.user?.id;
    if (ownerId && ownerId !== currentUserId) {
      throw notFound('Chat message not found');
    }

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
}
