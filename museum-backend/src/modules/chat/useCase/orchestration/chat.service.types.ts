import type { ChatAssistantMetadata, ChatSessionIntent } from '@modules/chat/domain/chat.types';

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

export interface PostAudioMessageResult extends PostMessageResult {
  transcription: {
    text: string;
    model: string;
    provider: 'openai';
  };
}

export interface DeleteSessionResult {
  sessionId: string;
  deleted: boolean;
}

export interface ReportMessageResult {
  messageId: string;
  reported: boolean;
}

export interface FeedbackMessageResult {
  messageId: string;
  status: 'created' | 'updated' | 'removed';
}

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

export interface ListSessionsResult {
  sessions: {
    id: string;
    locale?: string | null;
    museumMode: boolean;
    title?: string | null;
    museumName?: string | null;
    /**
     * Canonical museum identifier when known. Optional/nullable for backward-compat with
     * legacy clients and pre-museum sessions. Mirrors `ChatSession.museumId`.
     * Surfaced for B2 (conversation resumption banner) and future in-museum gating.
     */
    museumId?: number | null;
    /**
     * Title of the last artwork discussed during the session (latest entry of
     * `visitContext.artworksDiscussed`). `null` when no artwork has been
     * discussed yet or when visit context is absent.
     * Surfaced for B2 (conversation resumption banner).
     */
    lastArtworkTitle?: string | null;
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
