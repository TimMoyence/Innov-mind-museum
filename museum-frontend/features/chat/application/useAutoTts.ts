import { useCallback, useEffect, useRef } from 'react';

import type { ChatUiMessage } from '@/features/chat/application/chatSessionLogic.pure';
import { useTextToSpeech } from '@/features/chat/application/useTextToSpeech';

interface UseAutoTtsParams {
  messages: ChatUiMessage[];
  enabled: boolean;
}

/**
 * Auto-plays TTS for new assistant messages when audio description mode is enabled.
 * Watches for message count changes and triggers playback on the latest assistant message.
 */
export function useAutoTts({ messages, enabled }: UseAutoTtsParams) {
  const { togglePlayback, stopPlayback } = useTextToSpeech();
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

    // Find the latest assistant message
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== 'assistant') return;
    // Skip streaming placeholders (no real text yet)
    if (!lastMessage.text || lastMessage.id.endsWith('-streaming')) return;

    autoPlayingRef.current = true;
    void togglePlayback(lastMessage.id);
  }, [messages, togglePlayback]);

  // Stop playback when mode is toggled off
  useEffect(() => {
    if (!enabled && autoPlayingRef.current) {
      stopPlayback();
      autoPlayingRef.current = false;
    }
  }, [enabled, stopPlayback]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, [stopPlayback]);

  const stopAutoPlay = useCallback(() => {
    autoPlayingRef.current = false;
    stopPlayback();
  }, [stopPlayback]);

  return { stopAutoPlay };
}
