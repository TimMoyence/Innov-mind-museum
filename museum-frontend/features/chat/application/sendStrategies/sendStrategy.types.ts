import type { Dispatch, RefObject, SetStateAction } from 'react';

import type { chatApi } from '@/features/chat/infrastructure/chatApi';
import type { ChatUiMessage } from '../chatSessionLogic.pure';

/**
 * Shape of a chatLocalCache lookup hit used by the cache strategy.
 * Kept loosely typed because the production store provides its own record type.
 */
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

/**
 * Aggregated context bag passed to every send strategy. Built once per
 * `sendMessage` call inside `useChatSession` and passed as a single
 * immutable reference to avoid parameter explosion.
 */
export interface SendMessageContext {
  // Session & user preferences
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

  // Ports / adapters
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

  // State mutators
  setMessages: Dispatch<SetStateAction<ChatUiMessage[]>>;
  setIsStreaming: Dispatch<SetStateAction<boolean>>;
  setError: (error: string | null) => void;
  setDailyLimitReached: Dispatch<SetStateAction<boolean>>;

  // Streaming coordination
  streamTextRef: RefObject<string>;
  streamingIdRef: RefObject<string | null>;
  scheduleFlush: () => void;
  flushStreamText: () => void;
  resetStreaming: () => void;

  // Review prompt counter
  successfulSendsRef: RefObject<number>;
}

/**
 * Strategy outcome. `true` means the message was fully handled (success or graceful
 * enqueue), `false` means the strategy failed and the UI should surface an error.
 */
export type SendResult = boolean;
