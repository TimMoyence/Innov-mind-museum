import { useCallback, useEffect, useRef, useState } from 'react';
import * as Sentry from '@sentry/react-native';

import { getErrorMessage } from '@/shared/lib/errors';
import { chatApi } from '../infrastructure/chatApi';
import { useChatSessionStore } from '../infrastructure/chatSessionStore';
import {
  isRenderableAssistantContent,
  mapApiMessageToUiMessage,
  sortByTime,
  type ChatUiMessage,
} from './chatSessionLogic.pure';

interface CancellationTick {
  cancelled: boolean;
}

export const useSessionLoader = (
  sessionId: string,
  setMessages: React.Dispatch<React.SetStateAction<ChatUiMessage[]>>,
) => {
  const storeSetSession = useChatSessionStore((s) => s.setSession);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const [museumName, setMuseumName] = useState<string | null>(null);
  const [sessionMuseumMode, setSessionMuseumMode] = useState<boolean | null>(null);

  const loadTickRef = useRef<CancellationTick | null>(null);

  const loadSession = useCallback(async () => {
    if (loadTickRef.current) {
      loadTickRef.current.cancelled = true;
    }
    const tick: CancellationTick = { cancelled: false };
    loadTickRef.current = tick;

    setIsLoading(true);
    setError(null);

    try {
      const response = await chatApi.getSession(sessionId);
      const title = response.session.title ?? null;
      const museum = response.session.museumName ?? null;
      const sorted = sortByTime(
        response.messages
          .map(mapApiMessageToUiMessage)
          .filter(
            (m) => m.role !== 'assistant' || isRenderableAssistantContent(m.text, m.metadata),
          ),
      );
      storeSetSession(sessionId, sorted, title, museum);
      if (tick.cancelled) return;
      setSessionTitle(title);
      setMuseumName(museum);
      setSessionMuseumMode(response.session.museumMode);
      setMessages(sorted);
    } catch (loadError) {
      Sentry.captureException(loadError, { tags: { flow: 'chat.loadSession' } });
      if (tick.cancelled) return;
      setError(getErrorMessage(loadError));
      const cached = useChatSessionStore.getState().sessions[sessionId];
      if (cached) {
        setMessages(cached.messages);
        setSessionTitle(cached.title);
        setMuseumName(cached.museumName);
      }
    } finally {
      if (!tick.cancelled) {
        setIsLoading(false);
      }
    }
  }, [sessionId, storeSetSession, setMessages]);

  useEffect(() => {
    void loadSession();
    return () => {
      if (loadTickRef.current) {
        loadTickRef.current.cancelled = true;
      }
    };
  }, [loadSession]);

  return {
    isLoading,
    error,
    setError,
    sessionTitle,
    museumName,
    sessionMuseumMode,
    loadSession,
  };
};
