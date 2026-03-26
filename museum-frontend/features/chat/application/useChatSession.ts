import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Sentry from '@sentry/react-native';

import { getErrorMessage } from '@/shared/lib/errors';
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

export type { ChatUiMessage, ChatUiMessageMetadata };

/**
 * Manages chat session state: loads messages, sends text/image/audio messages with optimistic updates,
 * supports SSE streaming with throttled renders, refreshes signed image URLs, and exposes session metadata.
 * Persists messages to a Zustand store so they survive navigation and app restarts.
 * @param sessionId - ID of the chat session to manage.
 * @returns State (messages, loading/sending/streaming flags, error) and action callbacks.
 */
export const useChatSession = (sessionId: string) => {
  // Hydrate from Zustand store for instant display while API loads
  const cachedSession = useChatSessionStore((s) => s.sessions[sessionId]);
  const storeSetSession = useChatSessionStore((s) => s.setSession);
  const storeUpdateMessages = useChatSessionStore((s) => s.updateMessages);

  const [messages, setMessages] = useState<ChatUiMessage[]>(
    () => cachedSession?.messages ?? [],
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionTitle, setSessionTitle] = useState<string | null>(
    () => cachedSession?.title ?? null,
  );
  const [museumName, setMuseumName] = useState<string | null>(
    () => cachedSession?.museumName ?? null,
  );
  const isSendingRef = useRef(false);

  // Streaming state refs (avoid re-renders during token accumulation)
  const streamTextRef = useRef('');
  const streamingIdRef = useRef<string | null>(null);
  const updateTimerRef = useRef<number | null>(null);

  const { locale, museumMode, guideLevel } = useRuntimeSettings();
  const { isOffline, enqueue, dequeue, peek, pendingCount } = useOfflineQueue();
  const { isConnected } = useConnectivity();

  const loadSession = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await chatApi.getSession(sessionId);
      const title = response.session.title ?? null;
      const museum = response.session.museumName ?? null;
      setSessionTitle(title);
      setMuseumName(museum);
      const sorted = sortByTime(
        response.messages.map((message) => ({
          id: message.id,
          role: message.role,
          text: message.text ?? '',
          createdAt: message.createdAt,
          imageRef: message.imageRef,
          image: message.image ?? null,
          metadata: (message.metadata as ChatUiMessageMetadata) ?? null,
        })),
      );
      setMessages(sorted);
      // Sync API data into persistent store
      storeSetSession(sessionId, sorted, title, museum);
    } catch (loadError) {
      Sentry.captureException(loadError, { tags: { flow: 'chat.loadSession' } });
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, storeSetSession]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  // Sync local messages to persistent Zustand store whenever they change.
  // Skip syncing during streaming to avoid writing every intermediate token state.
  const isStreamingRef = useRef(false);
  isStreamingRef.current = isStreaming;
  useEffect(() => {
    if (isStreamingRef.current) return;
    if (messages.length === 0) return;
    storeUpdateMessages(sessionId, messages);
  }, [messages, sessionId, storeUpdateMessages]);

  // Smooth stream text flush — synced to display refresh via requestAnimationFrame
  const flushStreamText = useCallback(() => {
    const text = streamTextRef.current;
    const id = streamingIdRef.current;
    if (!id) return;
    setMessages(prev => prev.map(m =>
      m.id === id ? { ...m, text } : m,
    ));
  }, []);

  const scheduleFlush = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- multi-line RAF guard, ??= less readable
    if (!updateTimerRef.current) {
      updateTimerRef.current = requestAnimationFrame(() => {
        updateTimerRef.current = null;
        flushStreamText();
      });
    }
  }, [flushStreamText]);

  const sendMessage = useCallback(
    async (params: { text?: string; imageUri?: string; audioUri?: string; audioBlob?: Blob }) => {
      if (isSendingRef.current) {
        return false;
      }

      const trimmedText = params.text?.trim();
      if (!trimmedText && !params.imageUri && !params.audioUri && !params.audioBlob) {
        return false;
      }

      // Offline: queue the message for later and add an optimistic entry
      if (isOffline) {
        const queued = enqueue({
          sessionId,
          text: trimmedText,
          imageUri: params.imageUri,
        });
        const offlineMessage: ChatUiMessage = {
          id: queued.id,
          role: 'user',
          text: trimmedText ?? (params.imageUri ? '[Image sent]' : ''),
          createdAt: new Date().toISOString(),
          image: null,
        };
        setMessages((prev) => sortByTime([...prev, offlineMessage]));
        return true;
      }

      const optimisticMessage: ChatUiMessage = {
        id: `${Date.now()}-user`,
        role: 'user',
        text:
          trimmedText ??
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
            metadata: (response.metadata as ChatUiMessageMetadata) ?? null,
            transcription: ('transcription' in response && response.transcription)
              ? { text: (response.transcription as { text: string }).text }
              : null,
          };

          if (assistantMessage.transcription?.text) {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === optimisticMessage.id
                  ? { ...message, text: `🎙 ${assistantMessage.transcription!.text}` }
                  : message,
              ),
            );
          }

          setMessages((prev) => sortByTime([...prev, assistantMessage]));
          return true;
        }

        // Text/image messages: try streaming via sendMessageSmart
        const streamingPlaceholderId = `${Date.now()}-streaming`;
        streamTextRef.current = '';
        streamingIdRef.current = streamingPlaceholderId;

        // Add a placeholder assistant message for streaming text
        const streamingPlaceholder: ChatUiMessage = {
          id: streamingPlaceholderId,
          role: 'assistant',
          text: '',
          createdAt: new Date().toISOString(),
          metadata: null,
        };

        setMessages(prev => sortByTime([...prev, streamingPlaceholder]));
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
            // Clear any pending animation frame
            if (updateTimerRef.current) {
              cancelAnimationFrame(updateTimerRef.current);
              updateTimerRef.current = null;
            }

            // Capture text before clearing — React 18 batching defers the
            // updater function, so the ref would be '' by the time it runs.
            const finalText = streamTextRef.current;
            streamingIdRef.current = null;
            streamTextRef.current = '';

            // Replace placeholder with final committed message
            setMessages(prev => prev.map(m =>
              m.id === streamingPlaceholderId
                ? {
                    ...m,
                    id: payload.messageId,
                    text: finalText,
                    createdAt: payload.createdAt,
                    metadata: (payload.metadata as ChatUiMessageMetadata) ?? null,
                  }
                : m,
            ));
          },
          onGuardrail: (guardrailText) => {
            // Replace streaming text with guardrail message
            streamTextRef.current = guardrailText;
            flushStreamText();
          },
        });

        // If sendMessageSmart fell back to non-streaming (response has full text)
        if (response && !streamingIdRef.current) {
          // Already handled by onDone — but if response came via non-streaming path:
          if (response.message.text) {
            setMessages(prev => {
              // Check if the placeholder was already replaced by onDone
              const hasPlaceholder = prev.some(m => m.id === streamingPlaceholderId);
              if (hasPlaceholder) {
                return prev.map(m =>
                  m.id === streamingPlaceholderId
                    ? {
                        id: response.message.id,
                        role: response.message.role as 'assistant',
                        text: response.message.text,
                        createdAt: response.message.createdAt,
                        metadata: (response.metadata as ChatUiMessageMetadata) ?? null,
                        image: null,
                      }
                    : m,
                );
              }
              return prev;
            });
          }
        }

        setIsStreaming(false);
        return true;
      } catch (sendError) {
        Sentry.captureException(sendError, { tags: { flow: 'chat.sendMessage' } });
        setIsStreaming(false);
        // Clean up streaming state
        if (updateTimerRef.current) {
          cancelAnimationFrame(updateTimerRef.current);
          updateTimerRef.current = null;
        }
        streamingIdRef.current = null;
        streamTextRef.current = '';

        setMessages((prev) =>
          prev.filter((message) =>
            message.id !== optimisticMessage.id &&
            !message.id.endsWith('-streaming'),
          ),
        );
        setError(getErrorMessage(sendError));
        return false;
      } finally {
        setIsSending(false);
        isSendingRef.current = false;
      }
    },
    [locale, museumMode, guideLevel, sessionId, isOffline, enqueue, scheduleFlush, flushStreamText],
  );

  // Flush queued messages when connectivity is restored, then sync with server state
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
          // Only remove from queue after successful send
          dequeue();
          flushedAny = true;
        } catch {
          // If flush fails, stop trying — message stays in queue for next reconnect
          break;
        }
        next = peek();
      }

      // Re-fetch session to merge assistant replies without content jump
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
            metadata: (m.metadata as ChatUiMessageMetadata) ?? null,
          }));
          setMessages(sortByTime(serverMessages));
        } catch {
          // Sync failure is non-critical; user can pull-to-refresh
        }
      }
    };

    void flush();
  }, [isConnected, dequeue, peek, museumMode, guideLevel, locale, sessionId]);

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (updateTimerRef.current) {
        cancelAnimationFrame(updateTimerRef.current);
      }
    };
  }, []);

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
    isStreaming,
    isOffline,
    pendingCount,
    error,
    clearError: () => { setError(null); },
    reload: loadSession,
    sendMessage,
    refreshMessageImageUrl,
    locale,
    museumMode,
    sessionTitle,
    museumName,
  };
};
