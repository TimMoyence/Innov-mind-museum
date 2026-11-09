import type { Dispatch, RefObject, SetStateAction } from 'react';

import type { chatApi } from '@/features/chat/infrastructure/chatApi';
import type { ChatUiMessage } from '../chatSessionLogic.pure';

export interface CacheLookupParams {
  text: string;
  museumId: string;
  locale: string;
  guideLevel?: string;
}

export interface CacheStorePayload {
  question: string;
  answer: string;
  metadata?: Record<string, unknown>;
  museumId: string;
  locale: string;
  guideLevel?: string;
  cachedAt: number;
  source: 'prefetch' | 'previous-call';
}

export interface QueuedMessage {
  id: string;
  sessionId: string;
  text?: string;
  imageUri?: string;
  createdAt: number;
  retryCount: number;
}

export type ClassifyText = (text: string, locale: string) => 'art' | 'unknown';

export type ChatApiPort = typeof chatApi;

export interface SendMessageContext {
  sessionId: string;
  museumMode: boolean;
  museumName: string | null;
  guideLevel: string;
  locale: string;
  locationString: string | undefined;
  audioDescriptionMode: boolean;
  contentPreferences: readonly string[];
  isLowData: boolean;
  isConnected: boolean;
  imageFallbackLabel: string;
  audioFallbackLabel: string;

  chatApi: ChatApiPort;
  cacheLookup: (params: CacheLookupParams) => {
    question: string;
    answer: string;
    metadata?: Record<string, unknown>;
  } | null;
  cacheStore: (entry: CacheStorePayload) => void;
  enqueue: (msg: {
    sessionId: string;
    text?: string;
    imageUri?: string;
  }) => Promise<QueuedMessage | null>;
  classifyText: ClassifyText;

  setMessages: Dispatch<SetStateAction<ChatUiMessage[]>>;
  setIsStreaming: Dispatch<SetStateAction<boolean>>;
  setError: (error: string | null) => void;
  setDailyLimitReached: Dispatch<SetStateAction<boolean>>;

  streamTextRef: RefObject<string>;
  streamingIdRef: RefObject<string | null>;
  scheduleFlush: () => void;
  flushStreamText: () => void;
  resetStreaming: () => void;

  successfulSendsRef: RefObject<number>;
}

export type SendResult = boolean;
