import type { CreateSessionInput, ChatRole, ReportReason, VisitContext } from './chat.types';
import type { ChatMessage } from './chatMessage.entity';
import type { ChatSession } from './chatSession.entity';
import type { FeedbackValue } from './messageFeedback.entity';

/** Cursor-based pagination parameters for listing session messages. */
export interface ListSessionMessagesParams {
  sessionId: string;
  limit: number;
  cursor?: string;
}

/** Optional session-level fields to update atomically when persisting a message. */
interface PersistMessageSessionUpdates {
  title?: string;
  museumName?: string;
  visitContext?: VisitContext;
  locale?: string;
}

/** Input for persisting a single chat message and optional side-effects. */
export interface PersistMessageInput {
  sessionId: string;
  role: ChatRole;
  text?: string;
  imageRef?: string;
  metadata?: Record<string, unknown>;
  /** Session fields to update alongside the message (e.g. title, visit context). */
  sessionUpdates?: PersistMessageSessionUpdates;
  /** Artwork match to persist in the same transaction as the message. */
  artworkMatch?: Omit<PersistArtworkMatchInput, 'messageId'>;
}

/** Input for creating an artwork match record linked to a message. */
export interface PersistArtworkMatchInput {
  messageId: string;
  artworkId?: string;
  title?: string;
  artist?: string;
  confidence?: number;
  source?: string;
  room?: string;
}

/** A page of messages with cursor-based pagination metadata. */
export interface SessionMessagesPage {
  messages: ChatMessage[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** A message together with its owning session, used for ownership checks. */
export interface ChatMessageWithSessionOwnership {
  message: ChatMessage;
  session: ChatSession;
}

/** Cursor-based pagination parameters for listing a user's sessions. */
export interface ListSessionsParams {
  userId: number;
  limit: number;
  cursor?: string;
}

/** A session summary including the latest message preview and total count. */
interface ChatSessionSummary {
  session: ChatSession;
  /** Preview of the most recent message in the session. */
  preview?: {
    role: ChatRole;
    text?: string | null;
    createdAt: Date;
  };
  messageCount: number;
}

/** A page of session summaries with cursor-based pagination metadata. */
export interface ChatSessionsPage {
  sessions: ChatSessionSummary[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** Input for persisting a user report on a specific message. */
export interface PersistMessageReportInput {
  messageId: string;
  userId: number;
  reason: ReportReason;
  comment?: string;
}

/** Shape returned by {@link ChatRepository.exportUserData} for GDPR data export. */
export interface UserChatExportData {
  sessions: {
    id: string;
    locale?: string | null;
    museumMode: boolean;
    title?: string | null;
    museumName?: string | null;
    createdAt: string;
    updatedAt: string;
    messages: {
      id: string;
      role: string;
      text?: string | null;
      imageRef?: string | null;
      createdAt: string;
      metadata?: Record<string, unknown> | null;
    }[];
  }[];
}

/** Port for chat persistence operations. Implemented by {@link TypeOrmChatRepository}. */
export interface ChatRepository {
  /**
   * Create a new chat session.
   *
   * @param input - Session creation parameters (user, locale, museum mode).
   * @returns The newly created session.
   */
  createSession(input: CreateSessionInput): Promise<ChatSession>;

  /**
   * Retrieve a session by its UUID.
   *
   * @param sessionId - The session UUID.
   * @returns The session, or `null` if not found.
   */
  getSessionById(sessionId: string): Promise<ChatSession | null>;

  /**
   * Retrieve a message along with its owning session (for ownership verification).
   *
   * @param messageId - The message UUID.
   * @returns The message and session, or `null` if not found.
   */
  getMessageById(messageId: string): Promise<ChatMessageWithSessionOwnership | null>;

  /**
   * Delete a session only if it contains no messages.
   *
   * @param sessionId - The session UUID.
   * @returns `true` if the session was deleted, `false` if it had messages.
   */
  deleteSessionIfEmpty(sessionId: string): Promise<boolean>;

  /**
   * Persist a chat message and optionally update session fields or create an artwork match.
   *
   * @param input - Message data and optional side-effects.
   * @returns The persisted message.
   */
  persistMessage(input: PersistMessageInput): Promise<ChatMessage>;

  /**
   * List messages for a session with cursor-based pagination.
   *
   * @param params - Session ID, limit, and optional cursor.
   * @returns A page of messages.
   */
  listSessionMessages(params: ListSessionMessagesParams): Promise<SessionMessagesPage>;

  /**
   * List the most recent messages in a session (used for LLM history context).
   *
   * @param sessionId - The session UUID.
   * @param limit - Maximum number of messages to return.
   * @returns Messages in chronological order.
   */
  listSessionHistory(sessionId: string, limit: number): Promise<ChatMessage[]>;

  /**
   * List a user's sessions with cursor-based pagination.
   *
   * @param params - User ID, limit, and optional cursor.
   * @returns A page of session summaries.
   */
  listSessions(params: ListSessionsParams): Promise<ChatSessionsPage>;

  /**
   * Check whether a user has already reported a specific message.
   *
   * @param messageId - The message UUID.
   * @param userId - The reporting user's ID.
   * @returns `true` if a report already exists.
   */
  hasMessageReport(messageId: string, userId: number): Promise<boolean>;

  /**
   * Persist a message report from a user.
   *
   * @param input - Report data (message, user, reason, optional comment).
   */
  persistMessageReport(input: PersistMessageReportInput): Promise<void>;

  /**
   * Export all chat data for a user (GDPR data portability).
   *
   * @param userId - The user's numeric ID.
   * @returns All sessions and messages belonging to the user.
   */
  exportUserData(userId: number): Promise<UserChatExportData>;

  /**
   * Upsert a feedback entry for a message (INSERT or UPDATE on conflict).
   *
   * @param messageId - The message UUID.
   * @param userId - The user's numeric ID.
   * @param value - Feedback value ('positive' or 'negative').
   */
  upsertMessageFeedback(messageId: string, userId: number, value: FeedbackValue): Promise<void>;

  /**
   * Delete a feedback entry for a message.
   *
   * @param messageId - The message UUID.
   * @param userId - The user's numeric ID.
   */
  deleteMessageFeedback(messageId: string, userId: number): Promise<void>;

  /**
   * Get the current feedback for a message by a user.
   *
   * @param messageId - The message UUID.
   * @param userId - The user's numeric ID.
   * @returns The feedback value, or `null` if none exists.
   */
  getMessageFeedback(messageId: string, userId: number): Promise<{ value: FeedbackValue } | null>;

  /**
   * Update the cached TTS audio reference for a message (assistant only).
   *
   * @param messageId - The message UUID.
   * @param input - Audio storage reference, generation timestamp, and voice id.
   * @param input.audioUrl - Storage reference (`s3://<key>` or `local-audio://<file>`).
   * @param input.audioGeneratedAt - Timestamp when audio was generated.
   * @param input.audioVoice - Voice id used at synthesis (e.g. `alloy`).
   */
  updateMessageAudio(
    messageId: string,
    input: { audioUrl: string; audioGeneratedAt: Date; audioVoice: string },
  ): Promise<void>;

  /**
   * Clear the cached TTS audio reference for a message (e.g. after deletion in storage).
   *
   * @param messageId - The message UUID.
   */
  clearMessageAudio(messageId: string): Promise<void>;
}
