import { useCallback, useEffect, useRef } from 'react';

import type { ChatUiMessage } from '@/features/chat/application/chatSessionLogic.pure';
import { useTextToSpeech } from '@/features/chat/application/useTextToSpeech';

interface UseAutoTtsParams {
  messages: ChatUiMessage[];
  enabled: boolean;
}

/**
 * Return shape for {@link useAutoTts}. Exposes the in-flight TTS signal
 * (`loading`) so callers can wire it through to `useStatusPhase` and surface
 * the `synthesizing-voice` phase in `<StatusIndicator>` (spec A5.md §1.2 R16).
 */
export interface UseAutoTtsResult {
  /**
   * `true` while the auto-TTS request is fetching / decoding audio for the
   * latest assistant message. Flips back to `false` when playback starts,
   * the request errors out, or the request is skipped (low-data mode, etc.).
   */
  loading: boolean;
  /**
   * Cancels any auto-playback in flight and resets the internal flag. Safe to
   * call multiple times (idempotent via `stopPlayback`).
   */
  stopAutoPlay: () => void;
}

/**
 * Auto-plays TTS for new assistant messages when audio description mode is enabled.
 * Watches for message count changes and triggers playback on the latest assistant message.
 */
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

    // Find the latest assistant message
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role !== 'assistant') return;
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

  // A5 (R16) — expose the in-flight TTS signal so the screen can wire it to
  // `useStatusPhase({ ttsPending: tts.loading })` and render the
  // `synthesizing-voice` phase while audio is being fetched / decoded. We
  // gate it behind `enabled` so a stale `isLoading` from a recent toggle-off
  // never leaks back into the indicator.
  const loading = enabled && isLoading;

  return { stopAutoPlay, loading };
}
