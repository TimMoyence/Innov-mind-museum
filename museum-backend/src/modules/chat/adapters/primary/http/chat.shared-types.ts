import type { ChatSessionIntent, ContentPreference } from '@modules/chat/domain/chat.types';

export interface SessionInfo {
  id: string;
  locale?: string | null;
  museumMode: boolean;
  title?: string | null;
  museumName?: string | null;
  createdAt: string;
  updatedAt: string;
  /** Drives prompt strategy + walk-mode UX. */
  intent: ChatSessionIntent;
}

export interface PaginationInfo {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

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

export interface VisitorContext {
  location?: string;
  museumMode?: boolean;
  guideLevel?: 'beginner' | 'intermediate' | 'expert';
  locale?: string;
  /** Cached from /me by FE; source of truth = users.content_preferences col. */
  contentPreferences?: ContentPreference[];
}
