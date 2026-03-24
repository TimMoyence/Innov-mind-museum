import type { ChatAssistantMetadata } from '../domain/chat.types';

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
