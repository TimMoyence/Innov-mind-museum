import type { CreateSessionInput, ChatRole } from './chat.types';
import { ChatSession } from './chatSession.entity';
import { ChatMessage } from './chatMessage.entity';

export interface ListSessionMessagesParams {
  sessionId: string;
  limit: number;
  cursor?: string;
}

export interface PersistMessageInput {
  sessionId: string;
  role: ChatRole;
  text?: string;
  imageRef?: string;
  metadata?: Record<string, unknown>;
}

export interface PersistArtworkMatchInput {
  messageId: string;
  artworkId?: string;
  title?: string;
  artist?: string;
  confidence?: number;
  source?: string;
}

export interface SessionMessagesPage {
  messages: ChatMessage[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ListSessionsParams {
  userId: number;
  limit: number;
  cursor?: string;
}

export interface ChatSessionSummary {
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

export interface ChatRepository {
  createSession(input: CreateSessionInput): Promise<ChatSession>;
  getSessionById(sessionId: string): Promise<ChatSession | null>;
  persistMessage(input: PersistMessageInput): Promise<ChatMessage>;
  persistArtworkMatch(input: PersistArtworkMatchInput): Promise<void>;
  listSessionMessages(params: ListSessionMessagesParams): Promise<SessionMessagesPage>;
  listSessionHistory(sessionId: string, limit: number): Promise<ChatMessage[]>;
  listSessions(params: ListSessionsParams): Promise<ChatSessionsPage>;
}
