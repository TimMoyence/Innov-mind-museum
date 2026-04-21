import { useEffect } from 'react';

import { runWithRetry, isRetryableError, DEFAULT_BACKOFF_MS } from '@/shared/lib/retry';
import type { GuideLevel } from '@/features/settings/runtimeSettings.pure';
import { chatApi } from '../infrastructure/chatApi';
import { sortByTime, mapApiMessageToUiMessage, type ChatUiMessage } from './chatSessionLogic.pure';

/** Pluggable retry runner — swapped with a passthrough in tests to avoid real backoff delays. */
export type OfflineSyncRetryRunner = <T>(op: () => Promise<T>) => Promise<T>;

const DEFAULT_RETRY: OfflineSyncRetryRunner = (op) =>
  runWithRetry(op, { backoff: DEFAULT_BACKOFF_MS, shouldRetry: isRetryableError });

interface UseOfflineSyncParams {
  sessionId: string;
  isConnected: boolean;
  museumMode: boolean;
  location?: string;
  guideLevel: GuideLevel;
  locale: string;
  peek: () => { sessionId: string; text?: string; imageUri?: string } | undefined;
  dequeue: () => void;
  setMessages: React.Dispatch<React.SetStateAction<ChatUiMessage[]>>;
  /** Injected in tests to bypass real backoff delays. Defaults to {@link DEFAULT_RETRY}. */
  retry?: OfflineSyncRetryRunner;
  /** Injected in tests for deterministic error classification. Defaults to {@link isRetryableError}. */
  isRetryable?: (error: unknown) => boolean;
}

/**
 * Flushes queued offline messages when connectivity is restored,
 * then re-fetches the session to merge assistant replies.
 *
 * Non-retryable errors (e.g. 400 validation) drop the poison item and continue.
 * Retryable errors (network, 5xx) stop the cycle — item stays queued for the next tick.
 */
export const useOfflineSync = ({
  sessionId,
  isConnected,
  museumMode,
  location,
  guideLevel,
  locale,
  peek,
  dequeue,
  setMessages,
  retry = DEFAULT_RETRY,
  isRetryable = isRetryableError,
}: UseOfflineSyncParams) => {
  useEffect(() => {
    if (!isConnected) return;

    const flush = async () => {
      let next = peek();
      let flushedAny = false;
      while (next) {
        const currentItem = next;
        try {
          await retry(() =>
            chatApi.postMessage({
              sessionId: currentItem.sessionId,
              text: currentItem.text,
              imageUri: currentItem.imageUri,
              museumMode,
              location,
              guideLevel,
              locale,
            }),
          );
          dequeue();
          flushedAny = true;
        } catch (err) {
          if (isRetryable(err)) {
            // Retries exhausted — keep item queued for next connectivity tick
            break;
          }
          // Non-retryable (e.g. 400 validation) — drop the poison item and continue
          dequeue();
          flushedAny = true;
        }
        next = peek();
      }

      if (flushedAny) {
        try {
          const response = await chatApi.getSession(sessionId);
          setMessages(sortByTime(response.messages.map(mapApiMessageToUiMessage)));
        } catch {
          // Sync failure is non-critical; user can pull-to-refresh
        }
      }
    };

    void flush();
  }, [
    isConnected,
    dequeue,
    peek,
    museumMode,
    location,
    guideLevel,
    locale,
    sessionId,
    setMessages,
    retry,
    isRetryable,
  ]);
};
