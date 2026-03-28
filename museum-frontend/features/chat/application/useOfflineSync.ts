import { useEffect } from 'react';

import type { GuideLevel } from '@/features/settings/runtimeSettings.pure';
import { chatApi } from '../infrastructure/chatApi';
import {
  sortByTime,
  type ChatUiMessage,
  type ChatUiMessageMetadata,
} from './chatSessionLogic.pure';

interface UseOfflineSyncParams {
  sessionId: string;
  isConnected: boolean;
  museumMode: boolean;
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
          const serverMessages: ChatUiMessage[] = response.messages.map((m) => ({
            id: m.id,
            role: m.role,
            text: m.text ?? '',
            createdAt: m.createdAt,
            imageRef: m.imageRef,
            image: m.image ?? null,
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime API data
            metadata: (m.metadata as ChatUiMessageMetadata) ?? null,
          }));
          setMessages(sortByTime(serverMessages));
        } catch {
          // Sync failure is non-critical; user can pull-to-refresh
        }
      }
    };

    void flush();
  }, [isConnected, dequeue, peek, museumMode, guideLevel, locale, sessionId, setMessages]);
};
