import { useEffect } from 'react';

import type { GuideLevel } from '@/features/settings/runtimeSettings.pure';
import { chatApi } from '../infrastructure/chatApi';
import { sortByTime, mapApiMessageToUiMessage, type ChatUiMessage } from './chatSessionLogic.pure';

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
}

/**
 * Flushes queued offline messages when connectivity is restored,
 * then re-fetches the session to merge assistant replies.
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
}: UseOfflineSyncParams) => {
  useEffect(() => {
    if (!isConnected) return;

    const flush = async () => {
      let next = peek();
      let flushedAny = false;
      while (next) {
        try {
          await chatApi.postMessage({
            sessionId: next.sessionId,
            text: next.text,
            imageUri: next.imageUri,
            museumMode,
            location,
            guideLevel,
            locale,
          });
          dequeue();
          flushedAny = true;
        } catch {
          break;
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
  ]);
};
