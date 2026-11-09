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
  artworkMatch?: Omit<PersistArtworkMatchInput, 'messageId'>;
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

export interface UserChatExportData {
  sessions: {
    id: string;
    locale?: string | null;
    museumMode: boolean;
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
      artworkMatches: {
        artworkId: string | null;
        title: string | null;
        artist: string | null;
        confidence: number;
        source: string | null;
        room: string | null;
        createdAt: string;
      }[];
    }[];
  }[];
}

export interface MessageFeedbackExportRow {
  messageId: string;
  value: string;
  createdAt: Date | string;
}

export interface MessageReportExportRow {
  messageId: string;
  reason: string;
  comment: string | null;
  status: string;
  createdAt: Date | string;
}

export interface ChatRepository {
  createSession(input: CreateSessionInput): Promise<ChatSession>;

  getSessionById(sessionId: string): Promise<ChatSession | null>;

  getMessageById(messageId: string): Promise<ChatMessageWithSessionOwnership | null>;

  deleteSessionIfEmpty(sessionId: string): Promise<boolean>;

  persistMessage(input: PersistMessageInput): Promise<ChatMessage>;

  persistBlockedExchange(input: {
    userMessage: PersistMessageInput;
    refusal: PersistMessageInput;
  }): Promise<{ userMessage: ChatMessage; refusal: ChatMessage }>;

  listSessionMessages(params: ListSessionMessagesParams): Promise<SessionMessagesPage>;

  listSessionHistory(sessionId: string, limit: number): Promise<ChatMessage[]>;

  listSessions(params: ListSessionsParams): Promise<ChatSessionsPage>;

  hasMessageReport(messageId: string, userId: number): Promise<boolean>;

  persistMessageReport(input: PersistMessageReportInput): Promise<void>;

  exportUserData(userId: number): Promise<UserChatExportData>;

  upsertMessageFeedback(messageId: string, userId: number, value: FeedbackValue): Promise<void>;

  deleteMessageFeedback(messageId: string, userId: number): Promise<void>;

  getMessageFeedback(messageId: string, userId: number): Promise<{ value: FeedbackValue } | null>;

  updateMessageAudio(
    messageId: string,
    input: { audioUrl: string; audioGeneratedAt: Date; audioVoice: string },
  ): Promise<void>;

  clearMessageAudio(messageId: string): Promise<void>;

  findLegacyImageRefsByUserId(userId: number): Promise<string[]>;

  findAudioRefsByUserId(userId: number): Promise<string[]>;

  listMessageFeedbackForUser(userId: number): Promise<MessageFeedbackExportRow[]>;

  listMessageReportsForUser(userId: number): Promise<MessageReportExportRow[]>;

  updateSessionContext(
    sessionId: string,
    patch: {
      currentArtworkId?: string | null;
      currentRoom?: string | null;
    },
  ): Promise<void>;
}
