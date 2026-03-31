import { useCallback, useEffect, useRef, useState } from 'react';
import * as Sentry from '@sentry/react-native';

import { getErrorMessage } from '@/shared/lib/errors';
import { incrementCompletedSessions } from '@/shared/infrastructure/inAppReview';
import { useRuntimeSettings } from '@/features/settings/application/useRuntimeSettings';
import { useConnectivity } from '@/shared/infrastructure/connectivity/useConnectivity';
import { useOfflineQueue } from './useOfflineQueue';
import { chatApi } from '../infrastructure/chatApi';
import { useChatSessionStore } from '../infrastructure/chatSessionStore';
import {
  sortByTime,
  type ChatUiMessage,
  type ChatUiMessageMetadata,
} from './chatSessionLogic.pure';
import { useStreamingState } from './useStreamingState';
import { useOfflineSync } from './useOfflineSync';
import { useSessionLoader } from './useSessionLoader';

export type { ChatUiMessage, ChatUiMessageMetadata };

/**
 * Orchestrates chat session state by composing useSessionLoader, useStreamingState,
 * and useOfflineSync. Handles text/image/audio message sending with optimistic updates.
 */
export const useChatSession = (sessionId: string) => {
  const cachedSession = useChatSessionStore((s) => s.sessions[sessionId]);
  const storeUpdateMessages = useChatSessionStore((s) => s.updateMessages);

  const [messages, setMessages] = useState<ChatUiMessage[]>(
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- cachedSession can be undefined at runtime (store key miss)
    () => cachedSession?.messages ?? [],
  );
  const [isSending, setIsSending] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const isSendingRef = useRef(false);
  const successfulSendsRef = useRef(0);

  const { locale, museumMode, guideLevel } = useRuntimeSettings();
  const { isOffline, enqueue, dequeue, peek, pendingCount } = useOfflineQueue();
  const { isConnected } = useConnectivity();

  // Sub-hooks
  const { isLoading, error, setError, sessionTitle, museumName, loadSession } = useSessionLoader(
    sessionId,
    setMessages,
  );

  const { streamTextRef, streamingIdRef, flushStreamText, scheduleFlush, resetStreaming } =
    useStreamingState(setMessages);

  useOfflineSync({
    sessionId,
    isConnected,
    museumMode,
    guideLevel,
    locale,
    peek,
    dequeue,
    setMessages,
  });

  // Sync local messages to persistent Zustand store (skip during streaming)
  const isStreamingRef = useRef(false);
  isStreamingRef.current = isStreaming;
  useEffect(() => {
    if (isStreamingRef.current) return;
    if (messages.length === 0) return;
    storeUpdateMessages(sessionId, messages);
  }, [messages, sessionId, storeUpdateMessages]);

  const sendMessage = useCallback(
    async (params: { text?: string; imageUri?: string; audioUri?: string; audioBlob?: Blob }) => {
      if (isSendingRef.current) return false;

      const trimmedText = params.text?.trim();
      if (!trimmedText && !params.imageUri && !params.audioUri && !params.audioBlob) return false;

      // Offline: queue and add optimistic entry
      if (isOffline) {
        const queued = enqueue({ sessionId, text: trimmedText, imageUri: params.imageUri });
        if (!queued) return false;
        const offlineMessage: ChatUiMessage = {
          id: queued.id,
          role: 'user',
          text: trimmedText ?? (params.imageUri ? '[Image sent]' : ''),
          createdAt: new Date().toISOString(),
          image: params.imageUri ? { url: params.imageUri, expiresAt: '' } : null,
        };
        setMessages((prev) => sortByTime([...prev, offlineMessage]));
        return true;
      }

      const optimisticMessage: ChatUiMessage = {
        id: `${String(Date.now())}-user`,
        role: 'user',
        text:
          trimmedText ??
          (params.audioUri || params.audioBlob
            ? '[Voice message]'
            : params.imageUri
              ? '[Image sent]'
              : ''),
        createdAt: new Date().toISOString(),
        image: params.imageUri ? { url: params.imageUri, expiresAt: '' } : null,
      };

      setMessages((prev) => sortByTime([...prev, optimisticMessage]));
      setIsSending(true);
      isSendingRef.current = true;
      setError(null);

      try {
        // Audio messages always use non-streaming path
        if (params.audioUri || params.audioBlob) {
          const response = await chatApi.postAudioMessage({
            sessionId,
            audioUri: params.audioUri,
            audioBlob: params.audioBlob,
            museumMode,
            guideLevel,
            locale,
          });

          const assistantMessage: ChatUiMessage = {
            id: response.message.id,
            role: response.message.role,
            text: response.message.text,
            createdAt: response.message.createdAt,
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime API data
            metadata: (response.metadata as ChatUiMessageMetadata) ?? null,
            transcription:
              'transcription' in response && response.transcription
                ? { text: (response.transcription as { text: string }).text }
                : null,
          };

          const transcriptionText = assistantMessage.transcription?.text;
          if (transcriptionText) {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === optimisticMessage.id
                  ? { ...message, text: `🎙 ${transcriptionText}` }
                  : message,
              ),
            );
          }

          setMessages((prev) => sortByTime([...prev, assistantMessage]));
          successfulSendsRef.current += 1;
          if (successfulSendsRef.current === 3) {
            void incrementCompletedSessions();
          }
          return true;
        }

        // Text/image: streaming via sendMessageSmart
        const streamingPlaceholderId = `${String(Date.now())}-streaming`;
        streamTextRef.current = '';
        streamingIdRef.current = streamingPlaceholderId;

        const streamingPlaceholder: ChatUiMessage = {
          id: streamingPlaceholderId,
          role: 'assistant',
          text: '',
          createdAt: new Date().toISOString(),
          metadata: null,
        };

        setMessages((prev) => sortByTime([...prev, streamingPlaceholder]));
        setIsStreaming(true);

        const response = await chatApi.sendMessageSmart({
          sessionId,
          text: trimmedText,
          imageUri: params.imageUri,
          museumMode,
          guideLevel,
          locale,
          onToken: (chunk) => {
            streamTextRef.current += chunk;
            scheduleFlush();
          },
          onDone: (payload) => {
            const finalText = streamTextRef.current;
            resetStreaming();

            setMessages((prev) =>
              prev.map((m) =>
                m.id === streamingPlaceholderId
                  ? {
                      ...m,
                      id: payload.messageId,
                      text: finalText,
                      createdAt: payload.createdAt,
                      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime API data
                      metadata: (payload.metadata as ChatUiMessageMetadata) ?? null,
                    }
                  : m,
              ),
            );
          },
          onGuardrail: (guardrailText) => {
            streamTextRef.current = guardrailText;
            flushStreamText();
          },
        });

        // Non-streaming fallback (image messages or streaming not available)
        if (response && (!streamingIdRef.current || params.imageUri)) {
          resetStreaming();
          if (response.message.text) {
            setMessages((prev) => {
              const hasPlaceholder = prev.some((m) => m.id === streamingPlaceholderId);
              if (hasPlaceholder) {
                return prev.map((m) =>
                  m.id === streamingPlaceholderId
                    ? {
                        id: response.message.id,
                        role: response.message.role as 'assistant',
                        text: response.message.text,
                        createdAt: response.message.createdAt,
                        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime API data
                        metadata: (response.metadata as ChatUiMessageMetadata) ?? null,
                        image: null,
                      }
                    : m,
                );
              }
              return prev;
            });
          }

          // Replace local file:// preview with server signed URL
          if (params.imageUri) {
            void loadSession();
          }
        }

        setIsStreaming(false);
        successfulSendsRef.current += 1;
        if (successfulSendsRef.current === 3) {
          void incrementCompletedSessions();
        }
        return true;
      } catch (sendError) {
        Sentry.captureException(sendError, { tags: { flow: 'chat.sendMessage' } });
        setIsStreaming(false);
        resetStreaming();

        setMessages((prev) =>
          prev
            .filter((message) => !message.id.endsWith('-streaming'))
            .map((message) =>
              message.id === optimisticMessage.id ? { ...message, sendFailed: true } : message,
            ),
        );
        setError(getErrorMessage(sendError));
        return false;
      } finally {
        setIsSending(false);
        isSendingRef.current = false;
      }
    },
    [
      locale,
      museumMode,
      guideLevel,
      sessionId,
      isOffline,
      enqueue,
      scheduleFlush,
      flushStreamText,
      resetStreaming,
      setError,
      streamTextRef,
      streamingIdRef,
      loadSession,
    ],
  );

  const retryMessage = useCallback(
    (failedMessage: ChatUiMessage) => {
      setMessages((prev) => prev.filter((m) => m.id !== failedMessage.id));
      void sendMessage({
        text: failedMessage.text || undefined,
        imageUri: failedMessage.image?.url ?? undefined,
      });
    },
    [sendMessage],
  );

  const refreshMessageImageUrl = useCallback(async (messageId: string) => {
    const signed = await chatApi.getMessageImageUrl(messageId);
    setMessages((prev) =>
      prev.map((message) => (message.id === messageId ? { ...message, image: signed } : message)),
    );
    return signed;
  }, []);

  const isEmpty = messages.length === 0;

  return {
    messages,
    isEmpty,
    isLoading,
    isSending,
    isStreaming,
    isOffline,
    pendingCount,
    error,
    clearError: () => {
      setError(null);
    },
    reload: loadSession,
    sendMessage,
    retryMessage,
    refreshMessageImageUrl,
    locale,
    museumMode,
    sessionTitle,
    museumName,
  };
};
