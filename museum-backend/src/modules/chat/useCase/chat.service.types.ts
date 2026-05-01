import type { ChatAssistantMetadata, ChatSessionIntent } from '../domain/chat.types';

/** Returned after a new chat session is created. */
export interface CreateSessionResult {
  id: string;
  locale?: string | null;
  museumMode: boolean;
  title?: string | null;
  museumName?: string | null;
  createdAt: string;
  updatedAt: string;
  /** Session-level intent — drives prompt strategy and suggestion chips. */
  intent: ChatSessionIntent;
}

/** Returned after a user message is processed and the assistant replies. */
export interface PostMessageResult {
  sessionId: string;
  message: {
    id: string;
    role: 'assistant';
    text: string;
    createdAt: string;
    /** Next-artwork suggestion chips, present only for intent='walk' sessions. Sanitized, max 60 chars each. */
    suggestions?: string[];
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

/** Returned after a user sets or toggles feedback on an assistant message. */
export interface FeedbackMessageResult {
  messageId: string;
  status: 'created' | 'updated' | 'removed';
}

/** A single session with its paginated messages. */
export interface SessionResult {
  session: CreateSessionResult;
  messages: {
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
  }[];
  page: {
    nextCursor: string | null;
    hasMore: boolean;
    limit: number;
  };
}

/** Paginated list of sessions for a given user, each with a message preview. */
export interface ListSessionsResult {
  sessions: {
    id: string;
    locale?: string | null;
    museumMode: boolean;
    title?: string | null;
    museumName?: string | null;
    createdAt: string;
    updatedAt: string;
    /** Session-level intent — drives prompt strategy and walk-mode UX. */
    intent: ChatSessionIntent;
    preview?: {
      text: string;
      createdAt: string;
      role: 'user' | 'assistant' | 'system';
    };
    messageCount: number;
  }[];
  page: {
    nextCursor: string | null;
    hasMore: boolean;
    limit: number;
  };
}
