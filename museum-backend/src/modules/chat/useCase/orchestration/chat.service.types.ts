import type { ChatAssistantMetadata, ChatSessionIntent } from '@modules/chat/domain/chat.types';

export interface CreateSessionResult {
  id: string;
  locale?: string | null;
  museumMode: boolean;
  title?: string | null;
  museumName?: string | null;
  createdAt: string;
  updatedAt: string;
  intent: ChatSessionIntent;
}

export interface PostMessageResult {
  sessionId: string;
  message: {
    id: string;
    role: 'assistant';
    text: string;
    createdAt: string;
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
    museumId?: number | null;
    lastArtworkTitle?: string | null;
    createdAt: string;
    updatedAt: string;
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
