import { useCallback, useEffect, useMemo, useState } from 'react';

import { getErrorMessage } from '@/shared/lib/errors';
import {
  GuideLevel,
  loadRuntimeSettings,
} from '@/features/settings/runtimeSettings';
import { chatApi } from '../infrastructure/chatApi';

export interface ChatUiMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  createdAt: string;
  imageRef?: string | null;
}

const sortByTime = (messages: ChatUiMessage[]): ChatUiMessage[] => {
  return [...messages].sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
};

export const useChatSession = (sessionId: string) => {
  const [messages, setMessages] = useState<ChatUiMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [museumMode, setMuseumMode] = useState<boolean>(true);
  const [guideLevel, setGuideLevel] = useState<GuideLevel>('beginner');
  const [locale, setLocale] = useState<string>('en-US');

  const loadSession = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await chatApi.getSession(sessionId);
      setMessages(
        sortByTime(
          response.messages.map((message) => ({
            id: message.id,
            role: message.role,
            text: message.text || '',
            createdAt: message.createdAt,
            imageRef: message.imageRef,
          })),
        ),
      );
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadRuntimeSettings()
      .then((settings) => {
        setLocale(settings.defaultLocale);
        setMuseumMode(settings.defaultMuseumMode);
        setGuideLevel(settings.guideLevel);
      })
      .catch(() => {
        // fall back to defaults
      });

    void loadSession();
  }, [loadSession]);

  const sendMessage = useCallback(
    async (params: { text?: string; imageUri?: string }) => {
      const trimmedText = params.text?.trim();
      if (!trimmedText && !params.imageUri) {
        return;
      }

      const optimisticMessage: ChatUiMessage = {
        id: `${Date.now()}-user`,
        role: 'user',
        text: trimmedText || (params.imageUri ? '[Image sent]' : ''),
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => sortByTime([...prev, optimisticMessage]));
      setIsSending(true);
      setError(null);

      try {
        const response = await chatApi.postMessage({
          sessionId,
          text: trimmedText,
          imageUri: params.imageUri,
          museumMode,
          guideLevel,
          locale,
        });

        const assistantMessage: ChatUiMessage = {
          id: response.message.id,
          role: response.message.role,
          text: response.message.text,
          createdAt: response.message.createdAt,
        };

        setMessages((prev) => sortByTime([...prev, assistantMessage]));
      } catch (sendError) {
        setError(getErrorMessage(sendError));
      } finally {
        setIsSending(false);
      }
    },
    [locale, museumMode, guideLevel, sessionId],
  );

  const grouped = useMemo(() => sortByTime(messages), [messages]);

  return {
    messages: grouped,
    isLoading,
    isSending,
    error,
    clearError: () => setError(null),
    reload: loadSession,
    sendMessage,
    locale,
  };
};
