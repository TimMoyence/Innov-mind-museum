import { useCallback, useEffect, useState } from 'react';
import * as Sentry from '@sentry/react-native';

import { getErrorMessage } from '@/shared/lib/errors';
import { chatApi } from '../infrastructure/chatApi';
import { useChatSessionStore } from '../infrastructure/chatSessionStore';
import { sortByTime, mapApiMessageToUiMessage, type ChatUiMessage } from './chatSessionLogic.pure';

/**
 * Loads a chat session from the API, hydrating from the Zustand cache for instant display.
 * Manages session metadata (title, museum name) and loading/error state.
 */
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

  const loadSession = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await chatApi.getSession(sessionId);
      const title = response.session.title ?? null;
      const museum = response.session.museumName ?? null;
      setSessionTitle(title);
      setMuseumName(museum);
      setSessionMuseumMode(response.session.museumMode);
      const sorted = sortByTime(response.messages.map(mapApiMessageToUiMessage));
      setMessages(sorted);
      storeSetSession(sessionId, sorted, title, museum);
    } catch (loadError) {
      Sentry.captureException(loadError, { tags: { flow: 'chat.loadSession' } });
      setError(getErrorMessage(loadError));
      // Hydrate from cache so the user isn't left with an empty screen on a transient error.
      const cached = useChatSessionStore.getState().sessions[sessionId];
      if (cached) {
        setMessages(cached.messages);
        setSessionTitle(cached.title);
        setMuseumName(cached.museumName);
      }
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, storeSetSession, setMessages]);

  useEffect(() => {
    void loadSession();
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
