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
  image?: {
    url: string;
    expiresAt: string;
  } | null;
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
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const [museumName, setMuseumName] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await chatApi.getSession(sessionId);
      setSessionTitle(response.session.title ?? null);
      setMuseumName(response.session.museumName ?? null);
      setMessages(
        sortByTime(
          response.messages.map((message) => ({
            id: message.id,
            role: message.role,
            text: message.text || '',
            createdAt: message.createdAt,
            imageRef: message.imageRef,
            image: message.image ?? null,
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
    async (params: { text?: string; imageUri?: string; audioUri?: string; audioBlob?: Blob }) => {
      const trimmedText = params.text?.trim();
      if (!trimmedText && !params.imageUri && !params.audioUri && !params.audioBlob) {
        return false;
      }

      const optimisticMessage: ChatUiMessage = {
        id: `${Date.now()}-user`,
        role: 'user',
        text:
          trimmedText ||
          (params.audioUri || params.audioBlob
            ? '[Voice message]'
            : params.imageUri
              ? '[Image sent]'
              : ''),
        createdAt: new Date().toISOString(),
        image: null,
      };

      setMessages((prev) => sortByTime([...prev, optimisticMessage]));
      setIsSending(true);
      setError(null);

      try {
        const response = params.audioUri
          ? await chatApi.postAudioMessage({
              sessionId,
              audioUri: params.audioUri,
              audioBlob: params.audioBlob,
              museumMode,
              guideLevel,
              locale,
            })
          : await chatApi.postMessage({
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
        return true;
      } catch (sendError) {
        setMessages((prev) =>
          prev.filter((message) => message.id !== optimisticMessage.id),
        );
        setError(getErrorMessage(sendError));
        return false;
      } finally {
        setIsSending(false);
      }
    },
    [locale, museumMode, guideLevel, sessionId],
  );

  const grouped = useMemo(() => sortByTime(messages), [messages]);
  const isEmpty = grouped.length === 0;

  const refreshMessageImageUrl = useCallback(async (messageId: string) => {
    const signed = await chatApi.getMessageImageUrl(messageId);
    setMessages((prev) =>
      prev.map((message) =>
        message.id === messageId
          ? {
              ...message,
              image: signed,
            }
          : message,
      ),
    );
    return signed;
  }, []);

  return {
    messages: grouped,
    isEmpty,
    isLoading,
    isSending,
    error,
    clearError: () => setError(null),
    reload: loadSession,
    sendMessage,
    refreshMessageImageUrl,
    locale,
    sessionTitle,
    museumName,
  };
};
