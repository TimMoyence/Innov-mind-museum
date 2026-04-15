/** Reusable session info shape shared across multiple chat HTTP contract types. */
export interface SessionInfo {
  id: string;
  locale?: string | null;
  museumMode: boolean;
  title?: string | null;
  museumName?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Reusable pagination info shape shared across paginated chat HTTP responses. */
export interface PaginationInfo {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

/** Reusable chat message response shape used by PostMessageResponse and GetSessionResponse. */
export interface ChatMessageResponse {
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
}

import type { ContentPreference } from '../../../domain/chat.types';

/** Visitor context sent with message requests. */
export interface VisitorContext {
  location?: string;
  museumMode?: boolean;
  guideLevel?: 'beginner' | 'intermediate' | 'expert';
  locale?: string;
  /**
   * User's content preferences (cached from /me by the frontend): which aspects
   * of an artwork the visitor wants emphasized. Backend does not store per message;
   * the source of truth is the users.content_preferences column.
   */
  contentPreferences?: ContentPreference[];
}
