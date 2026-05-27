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

/**
 * Loads a chat session from the API, hydrating from the Zustand cache for instant display.
 * Manages session metadata (title, museum name) and loading/error state.
 *
 * Cancellation contract (TD-REACT-01): a closure-cell `tick` is captured per invocation
 * and tracked via `loadTickRef`. On unmount / sessionId change / rapid reload, the
 * previous tick flips `cancelled = true`, which guards every setState call after `await`.
 * Sentry capture and Zustand cache hydration intentionally run regardless of cancellation
 * — observability and cache freshness are independent of the consumer's UI binding.
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

  const loadTickRef = useRef<CancellationTick | null>(null);

  const loadSession = useCallback(async () => {
    // Cancel any in-flight invocation so a late response can't overwrite the fresh request.
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
      // Cycle 5 (EARS-6/D7) — a persisted assistant message with no renderable
      // content (degraded 200 saved blank in DB) must not reload as a phantom
      // empty bubble. User/system messages always pass; only non-renderable
      // assistant messages are filtered. `mapApiMessageToUiMessage` stays a pure
      // 1:1 map; the filter lives at the call-site.
      const sorted = sortByTime(
        response.messages
          .map(mapApiMessageToUiMessage)
          .filter(
            (m) => m.role !== 'assistant' || isRenderableAssistantContent(m.text, m.metadata),
          ),
      );
      // Hydrate the shared cache regardless of cancellation (R10).
      storeSetSession(sessionId, sorted, title, museum);
      if (tick.cancelled) return;
      setSessionTitle(title);
      setMuseumName(museum);
      setSessionMuseumMode(response.session.museumMode);
      setMessages(sorted);
    } catch (loadError) {
      // Observability stays unconditional (R9): engineers need every network error,
      // including ones whose UI consumer has already unmounted.
      Sentry.captureException(loadError, { tags: { flow: 'chat.loadSession' } });
      if (tick.cancelled) return;
      setError(getErrorMessage(loadError));
      // Hydrate from cache so the user isn't left with an empty screen on a transient error.
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
