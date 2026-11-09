import { useEffect } from 'react';

import { runWithRetry, isRetryableError, DEFAULT_BACKOFF_MS } from '@/shared/lib/retry';
import type { GuideLevel } from '@/features/settings/runtimeSettings.pure';
import { chatApi } from '../infrastructure/chatApi';
import { sortByTime, mapApiMessageToUiMessage, type ChatUiMessage } from './chatSessionLogic.pure';

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
  peek: () => { id: string; sessionId: string; text?: string; imageUri?: string } | undefined;
  dequeue: () => void;
  setMessages: React.Dispatch<React.SetStateAction<ChatUiMessage[]>>;
  retry?: OfflineSyncRetryRunner;
  isRetryable?: (error: unknown) => boolean;
}

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
              idempotencyKey: currentItem.id,
            }),
          );
          dequeue();
          flushedAny = true;
        } catch (err) {
          if (isRetryable(err)) {
            break;
          }
          dequeue();
          flushedAny = true;
        }
        next = peek();
      }

      if (flushedAny) {
        try {
          const response = await chatApi.getSession(sessionId);
          setMessages(sortByTime(response.messages.map(mapApiMessageToUiMessage)));
        } catch {}
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
