import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

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
  formatLocation,
  type ChatUiMessage,
  type ChatUiMessageMetadata,
} from './chatSessionLogic.pure';
import { pickSendStrategy, type SendAttempt } from './chatSessionStrategies.pure';
import {
  sendMessageAudio,
  sendMessageCache,
  sendMessageOffline,
  sendMessageStreaming,
  type SendMessageContext,
} from './sendStrategies';
import { useStreamingState } from './useStreamingState';
import { useOfflineSync } from './useOfflineSync';
import { useSessionLoader } from './useSessionLoader';

export type { ChatUiMessage, ChatUiMessageMetadata };

/**
 * Orchestrates chat session state by composing useSessionLoader, useStreamingState
 * and useOfflineSync, then dispatches outgoing messages to one of four strategies
 * (cache / offline / audio / streaming) via `pickSendStrategy`.
 */
export const useChatSession = (sessionId: string) => {
  const { t } = useTranslation();
  const cachedSession = useChatSessionStore((s) => s.sessions[sessionId]);
  const storeUpdateMessages = useChatSessionStore((s) => s.updateMessages);

  const [messages, setMessages] = useState<ChatUiMessage[]>(
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

  const runWithSending = useCallback(async (fn: () => Promise<boolean>): Promise<boolean> => {
    setIsSending(true);
    isSendingRef.current = true;
    try {
      return await fn();
    } finally {
      setIsSending(false);
      isSendingRef.current = false;
    }
  }, []);

  const sendMessage = useCallback(
    async (params: SendAttempt): Promise<boolean> => {
      if (isSendingRef.current) return false;

      const isFirstTurn = messagesLengthRef.current === 0;

      const strategy = pickSendStrategy(params, {
        isLowData,
        isOffline,
        isConnected,
        museumName,
        isFirstTurn,
      });
      if (!strategy) return false;

      const context: SendMessageContext = {
        sessionId,
        museumMode,
        museumName,
        guideLevel,
        locale,
        locationString,
        audioDescriptionMode,
        contentPreferences,
        isLowData,
        isConnected,
        imageFallbackLabel,
        audioFallbackLabel,
        chatApi,
        cacheLookup,
        cacheStore,
        enqueue,
        classifyText,
        setMessages,
        setIsStreaming,
        setError,
        setDailyLimitReached,
        streamTextRef,
        streamingIdRef,
        scheduleFlush,
        flushStreamText,
        resetStreaming,
        successfulSendsRef,
      };

      const trimmedText = params.text?.trim();

      if (strategy === 'cache' && trimmedText) {
        const outcome = await sendMessageCache({ text: trimmedText }, context);
        if (outcome.kind === 'hit' || outcome.kind === 'queued') return true;
        if (outcome.kind === 'failed') return false;
        // miss → fall through to streaming
      }

      if (strategy === 'offline') {
        return sendMessageOffline({ text: trimmedText, imageUri: params.imageUri }, context);
      }

      if (strategy === 'audio') {
        return runWithSending(() =>
          sendMessageAudio(
            { text: trimmedText, audioUri: params.audioUri, audioBlob: params.audioBlob },
            context,
          ),
        );
      }

      return runWithSending(() =>
        sendMessageStreaming(
          { text: trimmedText, imageUri: params.imageUri, isFirstTurn },
          context,
        ),
      );
    },
    [
      locale,
      museumMode,
      museumName,
      guideLevel,
      sessionId,
      isOffline,
      isConnected,
      isLowData,
      locationString,
      audioDescriptionMode,
      contentPreferences,
      imageFallbackLabel,
      audioFallbackLabel,
      enqueue,
      cacheLookup,
      cacheStore,
      classifyText,
      setError,
      streamTextRef,
      streamingIdRef,
      scheduleFlush,
      flushStreamText,
      resetStreaming,
      runWithSending,
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

  const lastAssistantPending = useMemo(() => {
    if (!isSending) return false;
    if (messages.length === 0) return true; // user just submitted, nothing yet
    const last = messages[messages.length - 1];
    if (!last) return true;
    if (last.role === 'user') return true;
    if (last.role === 'assistant' && (!last.text || last.text.length === 0)) return true;
    return false;
  }, [isSending, messages]);

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
    lastAssistantPending,
  };
};
