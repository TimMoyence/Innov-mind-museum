import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getErrorMessage } from '@/shared/lib/errors';
import { GuideLevel } from '@/features/settings/runtimeSettings';
import { useRuntimeSettings } from '@/features/settings/application/useRuntimeSettings';
import { useConnectivity } from '@/shared/infrastructure/connectivity/useConnectivity';
import { useOfflineQueue } from './useOfflineQueue';
import { chatApi } from '../infrastructure/chatApi';

/** Metadata attached to an assistant message, including artwork detection and follow-up suggestions. */
export interface ChatUiMessageMetadata {
  detectedArtwork?: {
    title?: string;
    artist?: string;
    museum?: string;
    room?: string;
    confidence?: number;
  };
  recommendations?: string[];
  followUpQuestions?: string[];
  expertiseSignal?: 'beginner' | 'intermediate' | 'expert';
  deeperContext?: string;
  openQuestion?: string;
  imageDescription?: string;
}

/** UI-layer representation of a single chat message (user, assistant, or system). */
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
  metadata?: ChatUiMessageMetadata | null;
  transcription?: { text: string } | null;
}

const sortByTime = (messages: ChatUiMessage[]): ChatUiMessage[] => {
  return [...messages].sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
};

/**
 * Manages chat session state: loads messages, sends text/image/audio messages with optimistic updates,
 * supports SSE streaming with throttled renders, refreshes signed image URLs, and exposes session metadata.
 * @param sessionId - ID of the chat session to manage.
 * @returns State (messages, loading/sending/streaming flags, error) and action callbacks.
 */
export const useChatSession = (sessionId: string) => {
  const [messages, setMessages] = useState<ChatUiMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const [museumName, setMuseumName] = useState<string | null>(null);
  const isSendingRef = useRef(false);

  // Streaming state refs (avoid re-renders during token accumulation)
  const streamTextRef = useRef('');
  const streamingIdRef = useRef<string | null>(null);
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { locale, museumMode, guideLevel } = useRuntimeSettings();
  const { isOffline, enqueue, dequeue, pendingCount } = useOfflineQueue();
  const { isConnected } = useConnectivity();

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
            metadata: (message.metadata as ChatUiMessageMetadata) ?? null,
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
    void loadSession();
  }, [loadSession]);

  // Throttled stream text flush — max 15 updates/sec (~66ms interval)
  const flushStreamText = useCallback(() => {
    const text = streamTextRef.current;
    const id = streamingIdRef.current;
    if (!id) return;
    setMessages(prev => prev.map(m =>
      m.id === id ? { ...m, text } : m,
    ));
  }, []);

  const scheduleFlush = useCallback(() => {
    if (!updateTimerRef.current) {
      updateTimerRef.current = setTimeout(() => {
        updateTimerRef.current = null;
        flushStreamText();
      }, 66);
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
          text: trimmedText || (params.imageUri ? '[Image sent]' : ''),
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
            // Clear any pending flush timer
            if (updateTimerRef.current) {
              clearTimeout(updateTimerRef.current);
              updateTimerRef.current = null;
            }

            // Replace placeholder with final committed message
            setMessages(prev => prev.map(m =>
              m.id === streamingPlaceholderId
                ? {
                    ...m,
                    id: payload.messageId,
                    text: streamTextRef.current,
                    createdAt: payload.createdAt,
                    metadata: (payload.metadata as ChatUiMessageMetadata) ?? null,
                  }
                : m,
            ));
            streamingIdRef.current = null;
            streamTextRef.current = '';
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
        setIsStreaming(false);
        // Clean up streaming state
        if (updateTimerRef.current) {
          clearTimeout(updateTimerRef.current);
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

  // Flush queued messages when connectivity is restored
  useEffect(() => {
    if (!isConnected) return;

    const flush = async () => {
      let next = dequeue();
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
        } catch {
          // If flush fails, stop trying (next reconnect will retry)
          break;
        }
        next = dequeue();
      }
    };

    void flush();
  }, [isConnected, dequeue, museumMode, guideLevel, locale]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (updateTimerRef.current) {
        clearTimeout(updateTimerRef.current);
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
    clearError: () => setError(null),
    reload: loadSession,
    sendMessage,
    refreshMessageImageUrl,
    locale,
    museumMode,
    sessionTitle,
    museumName,
  };
};
