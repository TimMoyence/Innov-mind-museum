import { renderHook, act } from '@testing-library/react-native';
import { useState } from 'react';

import { useStreamingState } from '@/features/chat/application/useStreamingState';
import type { ChatUiMessage } from '@/features/chat/application/chatSessionLogic.pure';
import { makeChatUiMessage } from '@/__tests__/helpers/factories';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useStreamingState', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** Helper that renders useStreamingState wired to a real useState setter. */
  const renderStreamingHook = (initialMessages: ChatUiMessage[] = []) => {
    const { result } = renderHook(() => {
      const [messages, setMessages] = useState(initialMessages);
      const streaming = useStreamingState(setMessages);
      return { messages, setMessages, ...streaming };
    });
    return result;
  };

  it('initialises with empty refs', () => {
    const result = renderStreamingHook();

    expect(result.current.streamTextRef.current).toBe('');
    expect(result.current.streamingIdRef.current).toBeNull();
    expect(result.current.updateTimerRef.current).toBeNull();
  });

  it('accumulates tokens in streamTextRef', () => {
    const result = renderStreamingHook();

    act(() => {
      result.current.streamTextRef.current = 'Hello';
    });
    expect(result.current.streamTextRef.current).toBe('Hello');

    act(() => {
      result.current.streamTextRef.current += ' world';
    });
    expect(result.current.streamTextRef.current).toBe('Hello world');
  });

  it('flushStreamText updates the matching message text', () => {
    const msg = makeChatUiMessage({ id: 'stream-1', text: '' });
    const result = renderStreamingHook([msg]);

    act(() => {
      result.current.streamingIdRef.current = 'stream-1';
      result.current.streamTextRef.current = 'Flushed content';
    });

    act(() => {
      result.current.flushStreamText();
    });

    const updated = result.current.messages.find((m) => m.id === 'stream-1');
    expect(updated?.text).toBe('Flushed content');
  });

  it('flushStreamText does nothing when streamingId is null', () => {
    const msg = makeChatUiMessage({ id: 'msg-1', text: 'original' });
    const result = renderStreamingHook([msg]);

    act(() => {
      result.current.streamingIdRef.current = null;
      result.current.streamTextRef.current = 'should not appear';
    });

    act(() => {
      result.current.flushStreamText();
    });

    expect(result.current.messages[0].text).toBe('original');
  });

  it('scheduleFlush triggers a flush after 40ms', () => {
    const msg = makeChatUiMessage({ id: 'stream-1', text: '' });
    const result = renderStreamingHook([msg]);

    act(() => {
      result.current.streamingIdRef.current = 'stream-1';
      result.current.streamTextRef.current = 'delayed flush';
      result.current.scheduleFlush();
    });

    // Before 40ms: no flush
    expect(result.current.messages[0].text).toBe('');

    act(() => {
      jest.advanceTimersByTime(40);
    });

    expect(result.current.messages[0].text).toBe('delayed flush');
  });

  it('scheduleFlush throttles: only one timer at a time', () => {
    const msg = makeChatUiMessage({ id: 'stream-1', text: '' });
    const result = renderStreamingHook([msg]);

    act(() => {
      result.current.streamingIdRef.current = 'stream-1';
      result.current.streamTextRef.current = 'first';
      result.current.scheduleFlush();
    });

    act(() => {
      // Second call while timer is pending should be ignored
      result.current.streamTextRef.current = 'second';
      result.current.scheduleFlush();
    });

    act(() => {
      jest.advanceTimersByTime(40);
    });

    // Should flush with the latest accumulated text
    expect(result.current.messages[0].text).toBe('second');
  });

  it('resetStreaming clears refs and cancels pending timer', () => {
    const msg = makeChatUiMessage({ id: 'stream-1', text: '' });
    const result = renderStreamingHook([msg]);

    act(() => {
      result.current.streamingIdRef.current = 'stream-1';
      result.current.streamTextRef.current = 'accumulated';
      result.current.scheduleFlush();
    });

    act(() => {
      result.current.resetStreaming();
    });

    expect(result.current.streamingIdRef.current).toBeNull();
    expect(result.current.streamTextRef.current).toBe('');
    expect(result.current.updateTimerRef.current).toBeNull();

    // Timer should have been cancelled — advancing should not flush
    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(result.current.messages[0].text).toBe('');
  });

  it('cleanup on unmount clears pending timers', () => {
    const msg = makeChatUiMessage({ id: 'stream-1', text: '' });
    const { result, unmount } = renderHook(() => {
      const [messages, setMessages] = useState([msg]);
      const streaming = useStreamingState(setMessages);
      return { messages, ...streaming };
    });

    act(() => {
      result.current.streamingIdRef.current = 'stream-1';
      result.current.streamTextRef.current = 'pending';
      result.current.scheduleFlush();
    });

    unmount();

    // No error should occur when timers fire after unmount
    act(() => {
      jest.advanceTimersByTime(100);
    });
  });

  it('flushStreamText leaves non-matching messages untouched', () => {
    const msg1 = makeChatUiMessage({ id: 'msg-1', text: 'keep me' });
    const msg2 = makeChatUiMessage({ id: 'stream-1', text: '' });
    const result = renderStreamingHook([msg1, msg2]);

    act(() => {
      result.current.streamingIdRef.current = 'stream-1';
      result.current.streamTextRef.current = 'new text';
    });

    act(() => {
      result.current.flushStreamText();
    });

    expect(result.current.messages[0].text).toBe('keep me');
    expect(result.current.messages[1].text).toBe('new text');
  });

  it('scheduleFlush allows a new timer after the first one fires', () => {
    const msg = makeChatUiMessage({ id: 'stream-1', text: '' });
    const result = renderStreamingHook([msg]);

    act(() => {
      result.current.streamingIdRef.current = 'stream-1';
      result.current.streamTextRef.current = 'batch-1';
      result.current.scheduleFlush();
    });

    act(() => {
      jest.advanceTimersByTime(40);
    });

    expect(result.current.messages[0].text).toBe('batch-1');

    // Now schedule a second flush
    act(() => {
      result.current.streamTextRef.current = 'batch-2';
      result.current.scheduleFlush();
    });

    act(() => {
      jest.advanceTimersByTime(40);
    });

    expect(result.current.messages[0].text).toBe('batch-2');
  });
});
