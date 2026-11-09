import { useCallback, useEffect, useRef } from 'react';

import type { ChatUiMessage } from '@/features/chat/application/chatSessionLogic.pure';
import { useTextToSpeech } from '@/features/chat/application/useTextToSpeech';

interface UseAutoTtsParams {
  messages: ChatUiMessage[];
  enabled: boolean;
}

export interface UseAutoTtsResult {
  loading: boolean;
  stopAutoPlay: () => void;
}

export function useAutoTts({ messages, enabled }: UseAutoTtsParams): UseAutoTtsResult {
  const { togglePlayback, stopPlayback, isLoading } = useTextToSpeech();
  const prevCountRef = useRef(messages.length);
  const autoPlayingRef = useRef(false);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    const prevCount = prevCountRef.current;
    prevCountRef.current = messages.length;

    if (!enabledRef.current) return;
    if (messages.length <= prevCount) return;

    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role !== 'assistant') return;
    if (!lastMessage.text || lastMessage.id.endsWith('-streaming')) return;

    autoPlayingRef.current = true;
    void togglePlayback(lastMessage.id);
  }, [messages, togglePlayback]);

  useEffect(() => {
    if (!enabled && autoPlayingRef.current) {
      stopPlayback();
      autoPlayingRef.current = false;
    }
  }, [enabled, stopPlayback]);

  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, [stopPlayback]);

  const stopAutoPlay = useCallback(() => {
    autoPlayingRef.current = false;
    stopPlayback();
  }, [stopPlayback]);

  const loading = enabled && isLoading;

  return { stopAutoPlay, loading };
}
