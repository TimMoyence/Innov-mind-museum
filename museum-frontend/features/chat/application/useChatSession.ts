import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Sentry from '@sentry/react-native';
import { useTranslation } from 'react-i18next';

import { getErrorMessage, isDailyLimitError } from '@/shared/lib/errors';
import { incrementCompletedSessions } from '@/shared/infrastructure/inAppReview';
import { useRuntimeSettings } from '@/features/settings/application/useRuntimeSettings';
import { useLocation } from '@/features/museum/application/useLocation';
import { useConnectivity } from '@/shared/infrastructure/connectivity/useConnectivity';
import { useArtKeywordsClassifier } from '@/features/art-keywords/application/useArtKeywordsClassifier';
import { useAudioDescriptionMode } from '@/features/settings/application/useAudioDescriptionMode';
import { useUserProfileStore } from '@/features/settings/infrastructure/userProfileStore';
import { useDataMode } from './DataModeProvider';
import { useChatLocalCacheStore } from './chatLocalCache';
import { useOfflineQueue } from './useOfflineQueue';
import { chatApi } from '../infrastructure/chatApi';
import { useChatSessionStore } from '../infrastructure/chatSessionStore';
import {
  sortByTime,
  buildOptimisticMessage,
  bumpSuccessfulSend,
  formatLocation,
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
  const { t } = useTranslation();
  const cachedSession = useChatSessionStore((s) => s.sessions[sessionId]);
  const storeUpdateMessages = useChatSessionStore((s) => s.updateMessages);

  const [messages, setMessages] = useState<ChatUiMessage[]>(
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- cachedSession can be undefined at runtime (store key miss)
    () => cachedSession?.messages ?? [],
  );
  const [isSending, setIsSending] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [dailyLimitReached, setDailyLimitReached] = useState(false);
  const isSendingRef = useRef(false);
  const successfulSendsRef = useRef(0);

  const { locale, museumMode: settingsMuseumMode, guideLevel } = useRuntimeSettings();
  const { latitude, longitude } = useLocation();
  const { isOffline, enqueue, dequeue, peek, pendingCount } = useOfflineQueue();
  const { isConnected } = useConnectivity();
  const { classifyText } = useArtKeywordsClassifier();
  const { enabled: audioDescriptionMode } = useAudioDescriptionMode();
  const contentPreferences = useUserProfileStore((s) => s.contentPreferences);
  const { isLowData } = useDataMode();
  const cacheLookup = useChatLocalCacheStore((s) => s.lookup);
  const cacheStore = useChatLocalCacheStore((s) => s.store);
  const messagesLengthRef = useRef(0);

  // Sub-hooks
  const { isLoading, error, setError, sessionTitle, museumName, sessionMuseumMode, loadSession } =
    useSessionLoader(sessionId, setMessages);

  // Session-level museumMode takes priority over settings (museum-initiated sessions)
  const museumMode = sessionMuseumMode ?? settingsMuseumMode;

  const { streamTextRef, streamingIdRef, flushStreamText, scheduleFlush, resetStreaming } =
    useStreamingState(setMessages);

  const locationString = useMemo(() => formatLocation(latitude, longitude), [latitude, longitude]);

  const imageFallbackLabel = t('chat.optimistic.image_placeholder');
  const audioFallbackLabel = t('chat.optimistic.voice_placeholder');

  useOfflineSync({
    sessionId,
    isConnected,
    museumMode,
    location: locationString,
    guideLevel,
    locale,
    peek,
    dequeue,
    setMessages,
  });

  // Sync local messages to persistent Zustand store (skip during streaming)
  const isStreamingRef = useRef(false);
  isStreamingRef.current = isStreaming;
  messagesLengthRef.current = messages.length;
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

      const isFirstTurn = messagesLengthRef.current === 0;

      // Low-data cache-first: text-only first turn in a museum session
      if (isLowData && museumName && trimmedText && !params.imageUri && isFirstTurn) {
        const cached = cacheLookup({
          text: trimmedText,
          museumId: museumName,
          locale,
          guideLevel,
        });

        if (cached) {
          const userMsg = buildOptimisticMessage({ text: trimmedText });
          const assistantMsg: ChatUiMessage = {
            id: `${String(Date.now())}-cached`,
            role: 'assistant',
            text: cached.answer,
            createdAt: new Date().toISOString(),
            metadata: (cached.metadata as ChatUiMessageMetadata) ?? null,
            cached: true,
          };
          setMessages((prev) => sortByTime([...prev, userMsg, assistantMsg]));
          return true;
        }

        // Low-data + offline → queue for later
        if (!isConnected) {
          const queued = await enqueue({ sessionId, text: trimmedText });
          if (!queued) return false;
          const offlineMessage = buildOptimisticMessage({ text: trimmedText, id: queued.id });
          setMessages((prev) => sortByTime([...prev, offlineMessage]));
          return true;
        }
      }

      // Offline: queue and add optimistic entry
      if (isOffline) {
        const queued = await enqueue({ sessionId, text: trimmedText, imageUri: params.imageUri });
        if (!queued) return false;
        const offlineMessage = buildOptimisticMessage({
          text: trimmedText,
          imageUri: params.imageUri,
          id: queued.id,
          imageFallbackLabel,
        });
        setMessages((prev) => sortByTime([...prev, offlineMessage]));
        return true;
      }

      const optimisticMessage = buildOptimisticMessage({
        text: trimmedText,
        imageUri: params.imageUri,
        hasAudio: Boolean(params.audioUri || params.audioBlob),
        imageFallbackLabel,
        audioFallbackLabel,
      });

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
            location: locationString,
            audioDescriptionMode: audioDescriptionMode || undefined,
            contentPreferences: contentPreferences.length > 0 ? contentPreferences : undefined,
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
          if (bumpSuccessfulSend(successfulSendsRef)) {
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

        const preClassified =
          trimmedText && classifyText(trimmedText, locale) === 'art' ? ('art' as const) : undefined;

        const response = await chatApi.sendMessageSmart({
          sessionId,
          text: trimmedText,
          imageUri: params.imageUri,
          museumMode,
          guideLevel,
          locale,
          location: locationString,
          preClassified,
          audioDescriptionMode: audioDescriptionMode || undefined,
          lowDataMode: isLowData,
          contentPreferences: contentPreferences.length > 0 ? contentPreferences : undefined,
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

          // Keep the optimistic user message with its local file:// URL — it renders
          // reliably on-device. The server-signed URL is fetched lazily on next session
          // open via loadSession(); refreshing eagerly here risks overwriting a working
          // local preview with an unreachable signed URL (e.g. Host header mismatch in dev).
        }

        setIsStreaming(false);

        // Cache successful text-only first-turn responses for future low-data hits
        if (response && museumName && trimmedText && !params.imageUri && isFirstTurn) {
          cacheStore({
            question: trimmedText,
            answer: response.message.text,
            metadata: response.metadata as Record<string, unknown> | undefined,
            museumId: museumName,
            locale,
            guideLevel,
            cachedAt: Date.now(),
            source: 'previous-call',
          });
        }

        if (bumpSuccessfulSend(successfulSendsRef)) {
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

        if (isDailyLimitError(sendError)) {
          setDailyLimitReached(true);
        } else {
          setError(getErrorMessage(sendError));
        }
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
      locationString,
      enqueue,
      scheduleFlush,
      flushStreamText,
      resetStreaming,
      setError,
      streamTextRef,
      streamingIdRef,
      classifyText,
      audioDescriptionMode,
      contentPreferences,
      isLowData,
      isConnected,
      cacheLookup,
      cacheStore,
      museumName,
      imageFallbackLabel,
      audioFallbackLabel,
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
    dailyLimitReached,
    clearDailyLimit: () => {
      setDailyLimitReached(false);
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
