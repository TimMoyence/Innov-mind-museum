import type { ChatSession } from './chatSession.entity';
import type {
  CreateSessionInput,
  ChatRole,
  ReportReason,
  VisitContext,
} from '@modules/chat/domain/chat.types';
import type { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import type { FeedbackValue } from '@modules/chat/domain/message/messageFeedback.entity';

export interface ListSessionMessagesParams {
  sessionId: string;
  limit: number;
  cursor?: string;
}

interface PersistMessageSessionUpdates {
  title?: string;
  museumName?: string;
  visitContext?: VisitContext;
  locale?: string;
}

export interface PersistMessageInput {
  sessionId: string;
  role: ChatRole;
  text?: string;
  imageRef?: string;
  metadata?: Record<string, unknown>;
  sessionUpdates?: PersistMessageSessionUpdates;
  /** Persisted in the same transaction as the message. */
  artworkMatch?: Omit<PersistArtworkMatchInput, 'messageId'>;
  /**
   * PR-P0-1 (2026-05-23) — opaque LLM-cache-invalidation cookie persisted on
   * the `chat_messages.cache_key` column. Set ONLY for assistant messages
   * whose response was cached (so `ChatMediaService.invalidateCacheForFeedback`
   * can purge the exact entry on negative feedback). Null otherwise.
   * Internal-only (NFR-2) — never exposed via API responses.
   */
  cacheKey?: string | null;
}

export interface PersistArtworkMatchInput {
  messageId: string;
  artworkId?: string;
  title?: string;
  artist?: string;
  confidence?: number;
  source?: string;
  room?: string;
}

export interface SessionMessagesPage {
  messages: ChatMessage[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** Used for ownership checks. */
export interface ChatMessageWithSessionOwnership {
  message: ChatMessage;
  session: ChatSession;
}

export interface ListSessionsParams {
  userId: number;
  limit: number;
  cursor?: string;
}

interface ChatSessionSummary {
  session: ChatSession;
  preview?: {
    role: ChatRole;
    text?: string | null;
    createdAt: Date;
  };
  messageCount: number;
}

export interface ChatSessionsPage {
  sessions: ChatSessionSummary[];
  nextCursor: string | null;
  hasMore: boolean;
}

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
    // B3 (DSAR) — previously-omitted ChatSession columns (R13).
    intent?: string | null;
    museumId?: number | null;
    coordinates?: { lat: number; lng: number } | null;
    visitContext?: VisitContext | null;
    currentRoom?: string | null;
    currentArtworkId?: string | null;
    title?: string | null;
    museumName?: string | null;
    createdAt: string;
    updatedAt: string;
    messages: {
      id: string;
      role: string;
      text?: string | null;
      imageRef?: string | null;
      audioUrl?: string | null;
      createdAt: string;
      metadata?: Record<string, unknown> | null;
    }[];
  }[];
}

/** DSAR (Art.15/20) — subject-facing message-feedback export row (B3 / T1.10). */
export interface MessageFeedbackExportRow {
  messageId: string;
  value: string;
  createdAt: Date | string;
}

/**
 * DSAR (Art.15/20) — subject-facing message-report export row (B3 / T1.10, D7).
 * `reviewedBy` / `reviewerNotes` / `reviewedAt` are third-party moderator data
 * and are intentionally NOT part of this shape.
 */
export interface MessageReportExportRow {
  messageId: string;
  reason: string;
  comment: string | null;
  status: string;
  createdAt: Date | string;
}

/** Implemented by {@link TypeOrmChatRepository}. */
export interface ChatRepository {
  createSession(input: CreateSessionInput): Promise<ChatSession>;

  getSessionById(sessionId: string): Promise<ChatSession | null>;

  /** For ownership verification. */
  getMessageById(messageId: string): Promise<ChatMessageWithSessionOwnership | null>;

  /** @returns `true` if deleted, `false` if it had messages. */
  deleteSessionIfEmpty(sessionId: string): Promise<boolean>;

  persistMessage(input: PersistMessageInput): Promise<ChatMessage>;

  /**
   * Atomically persists a blocked user message + assistant refusal in a single
   * transaction. Prevents data-integrity bug where the user attempt lands in DB
   * but the refusal write fails — orphan row for auditors + broken view for user.
   */
  persistBlockedExchange(input: {
    userMessage: PersistMessageInput;
    refusal: PersistMessageInput;
  }): Promise<{ userMessage: ChatMessage; refusal: ChatMessage }>;

  listSessionMessages(params: ListSessionMessagesParams): Promise<SessionMessagesPage>;

  /** Most recent messages for LLM history context. Chronological order. */
  listSessionHistory(sessionId: string, limit: number): Promise<ChatMessage[]>;

  listSessions(params: ListSessionsParams): Promise<ChatSessionsPage>;

  hasMessageReport(messageId: string, userId: number): Promise<boolean>;

  persistMessageReport(input: PersistMessageReportInput): Promise<void>;

  /** GDPR data portability. */
  exportUserData(userId: number): Promise<UserChatExportData>;

  /** INSERT or UPDATE on conflict. */
  upsertMessageFeedback(messageId: string, userId: number, value: FeedbackValue): Promise<void>;

  deleteMessageFeedback(messageId: string, userId: number): Promise<void>;

  getMessageFeedback(messageId: string, userId: number): Promise<{ value: FeedbackValue } | null>;

  /** Assistant only. `audioUrl` = `s3://<key>` or `local-audio://<file>`. */
  updateMessageAudio(
    messageId: string,
    input: { audioUrl: string; audioGeneratedAt: Date; audioVoice: string },
  ): Promise<void>;

  clearMessageAudio(messageId: string): Promise<void>;

  /**
   * Used by GDPR right-to-erasure (SEC-23) to resolve "legacy" image keys —
   * records written before the user-scoped key format existed. MUST run BEFORE
   * the user row is removed, otherwise CASCADE nukes the rows and refs are lost.
   */
  findLegacyImageRefsByUserId(userId: number): Promise<string[]>;

  /**
   * GDPR right-to-erasure (B1) — resolves the user's stored TTS audio refs from
   * the DB so the deletion flow can delete each S3 object via
   * `AudioStorage.deleteByRef`. MUST run BEFORE the user row is removed (CASCADE
   * wipes the rows that carry `audioUrl`). Audio keys have no user segment, so a
   * prefix scan is impossible — the DB ref set is the only reliable source.
   */
  findAudioRefsByUserId(userId: number): Promise<string[]>;

  /** DSAR (Art.15/20) — the user's message feedback projected to the export DTO. */
  listMessageFeedbackForUser(userId: number): Promise<MessageFeedbackExportRow[]>;

  /** DSAR (Art.15/20) — the user's message reports projected to the export DTO (excludes moderator fields, D7). */
  listMessageReportsForUser(userId: number): Promise<MessageReportExportRow[]>;

  /**
   * W3 (T5.3) — patches `current_artwork_id` and/or `current_room` on the
   * given session row. `undefined` skips the field (do not touch);
   * explicit `null` clears it (visitor scanned a museum-only QR). The caller
   * MUST validate UUID v4 format BEFORE invoking — repo does no validation.
   *
   * Concurrency: no row-lock — last writer wins; cartel scans are rare-enough
   * single-user events that we accept the natural race.
   *
   * @throws {Error} bubbles TypeORM driver errors.
   */
  updateSessionContext(
    sessionId: string,
    patch: {
      currentArtworkId?: string | null;
      currentRoom?: string | null;
    },
  ): Promise<void>;
}
