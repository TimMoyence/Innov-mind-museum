import { useCallback, useEffect, useRef } from 'react';

import type { ChatUiMessage } from './chatSessionLogic.pure';

const FLUSH_INTERVAL_MS = 30;

export const useStreamingState = (
  setMessages: React.Dispatch<React.SetStateAction<ChatUiMessage[]>>,
) => {
  const streamTextRef = useRef('');
  const streamingIdRef = useRef<string | null>(null);
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushStreamText = useCallback(() => {
    const text = streamTextRef.current;
    const id = streamingIdRef.current;
    if (!id) return;
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text } : m)));
  }, [setMessages]);

  const scheduleFlush = useCallback(() => {
    updateTimerRef.current ??= setTimeout(() => {
      updateTimerRef.current = null;
      flushStreamText();
    }, FLUSH_INTERVAL_MS);
  }, [flushStreamText]);

  const resetStreaming = useCallback(() => {
    if (updateTimerRef.current) {
      clearTimeout(updateTimerRef.current);
      updateTimerRef.current = null;
    }
    streamingIdRef.current = null;
    streamTextRef.current = '';
  }, []);

  useEffect(() => {
    return () => {
      if (updateTimerRef.current) {
        clearTimeout(updateTimerRef.current);
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
