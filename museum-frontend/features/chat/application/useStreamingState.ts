import { useCallback, useEffect, useRef } from 'react';

import type { ChatUiMessage } from './chatSessionLogic.pure';

/**
 * Manages streaming text accumulation with requestAnimationFrame-throttled flushes.
 * Keeps streaming state in refs to avoid re-renders during rapid token accumulation.
 */
export const useStreamingState = (
  setMessages: React.Dispatch<React.SetStateAction<ChatUiMessage[]>>,
) => {
  const streamTextRef = useRef('');
  const streamingIdRef = useRef<string | null>(null);
  const updateTimerRef = useRef<number | null>(null);

  const flushStreamText = useCallback(() => {
    const text = streamTextRef.current;
    const id = streamingIdRef.current;
    if (!id) return;
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text } : m)));
  }, [setMessages]);

  const scheduleFlush = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- multi-line RAF guard, ??= less readable
    if (!updateTimerRef.current) {
      updateTimerRef.current = requestAnimationFrame(() => {
        updateTimerRef.current = null;
        flushStreamText();
      });
    }
  }, [flushStreamText]);

  const resetStreaming = useCallback(() => {
    if (updateTimerRef.current) {
      cancelAnimationFrame(updateTimerRef.current);
      updateTimerRef.current = null;
    }
    streamingIdRef.current = null;
    streamTextRef.current = '';
  }, []);

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (updateTimerRef.current) {
        cancelAnimationFrame(updateTimerRef.current);
      }
    };
  }, []);

  return {
    streamTextRef,
    streamingIdRef,
    updateTimerRef,
    flushStreamText,
    scheduleFlush,
    resetStreaming,
  };
};
