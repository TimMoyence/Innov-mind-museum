import { ChatMediaService } from './chat-media.service';
import { ChatMessageService } from './chat-message.service';
import { ChatSessionService } from './chat-session.service';
import { DisabledAudioTranscriber } from '../domain/ports/audio-transcriber.port';

import type { GuardrailBlockReason } from './art-topic-guardrail';
import type {
  CreateSessionResult,
  DeleteSessionResult,
  ListSessionsResult,
  PostAudioMessageResult,
  PostMessageResult,
  ReportMessageResult,
  SessionResult,
} from './chat.service.types';
import type { UserMemoryService } from './user-memory.service';
import type { ChatRepository } from '../domain/chat.repository.interface';
import type {
  CreateSessionInput,
  MessagePageQuery,
  PostAudioMessageInput,
  PostMessageInput,
  ReportReason,
} from '../domain/chat.types';
import type { AudioTranscriber } from '../domain/ports/audio-transcriber.port';
import type { ChatOrchestrator } from '../domain/ports/chat-orchestrator.port';
import type { ImageStorage } from '../domain/ports/image-storage.port';
import type { OcrService } from '../domain/ports/ocr.port';
import type { TextToSpeechService } from '../domain/ports/tts.port';
import type { AuditService } from '@shared/audit/audit.service';
import type { CacheService } from '@shared/cache/cache.port';

// Re-export all public types so external consumers keep the same import path
export type {
  CreateSessionResult,
  PostMessageResult,
  PostAudioMessageResult,
  DeleteSessionResult,
  ReportMessageResult,
  SessionResult,
  ListSessionsResult,
} from './chat.service.types';

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

/**
 * Facade that orchestrates the chat lifecycle by delegating to specialised sub-services:
 * - {@link ChatSessionService}  — session CRUD
 * - {@link ChatMessageService}  — message posting (text, image, audio, streaming)
 * - {@link ChatMediaService}    — image refs, reporting, TTS
 *
 * The public API surface is unchanged — callers interact with the same methods as before.
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
    });

    this.messages = new ChatMessageService({
      repository: deps.repository,
      orchestrator: deps.orchestrator,
      imageStorage: deps.imageStorage,
      audioTranscriber,
      cache: deps.cache,
      ocr: deps.ocr,
      audit: deps.audit,
      userMemory: deps.userMemory,
    });

    this.media = new ChatMediaService({
      repository: deps.repository,
      tts: deps.tts,
      cache: deps.cache,
    });
  }

  // ── Session CRUD ──────────────────────────────────────────────────────

  /**
   * Creates a new chat session.
   *
   * @param input - Session creation parameters (userId, locale, museumMode).
   * @returns The newly created session.
   * @throws {AppError} 400 if userId is not a positive integer.
   */
  async createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
    return await this.sessions.createSession(input);
  }

  /**
   * Retrieves a session with its paginated messages.
   *
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
    return await this.sessions.getSession(sessionId, page, currentUserId);
  }

  /**
   * Lists all sessions for the authenticated user with cursor-based pagination.
   *
   * @param page - Cursor-based pagination parameters (limit, cursor).
   * @param currentUserId - Authenticated user id (required).
   * @returns Paginated sessions with message previews.
   * @throws {AppError} 400 if userId is missing/invalid or cursor is malformed.
   */
  async listSessions(
    page: MessagePageQuery,
    currentUserId?: number,
  ): Promise<ListSessionsResult> {
    return await this.sessions.listSessions(page, currentUserId);
  }

  /**
   * Deletes a session only if it contains no messages.
   *
   * @param sessionId - UUID of the session to delete.
   * @param currentUserId - Authenticated user id for ownership checks.
   * @returns Whether the session was actually deleted.
   * @throws {AppError} 400 on invalid id, 404 if session not found or not owned.
   */
  async deleteSessionIfEmpty(
    sessionId: string,
    currentUserId?: number,
  ): Promise<DeleteSessionResult> {
    return await this.sessions.deleteSessionIfEmpty(sessionId, currentUserId);
  }

  // ── Message posting ───────────────────────────────────────────────────

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
    return await this.messages.postMessage(sessionId, input, requestId, currentUserId);
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
  // eslint-disable-next-line max-params -- delegates to message service, must pass through all streaming parameters
  async postMessageStream(
    sessionId: string,
    input: PostMessageInput,
    onToken: (text: string) => void,
    onGuardrail?: (text: string, reason: GuardrailBlockReason) => void,
    requestId?: string,
    currentUserId?: number,
    signal?: AbortSignal,
  ): Promise<PostMessageResult> {
    return await this.messages.postMessageStream(sessionId, input, onToken, onGuardrail, requestId, currentUserId, signal);
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
    return await this.messages.postAudioMessage(sessionId, input, requestId, currentUserId);
  }

  // ── Media & reporting ─────────────────────────────────────────────────

  /**
   * Resolves the image reference for a message, including local file name and content type when applicable.
   *
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
    return await this.media.getMessageImageRef(messageId, currentUserId);
  }

  /**
   * Reports an assistant message for moderation.
   *
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
    return await this.media.reportMessage(messageId, reason, currentUserId, comment);
  }

  /**
   * Synthesizes speech from an assistant message's text content.
   *
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
    return await this.media.synthesizeSpeech(messageId, currentUserId);
  }
}
