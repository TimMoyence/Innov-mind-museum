import { renderHook, act } from '@testing-library/react-native';

import { makeAssistantMessage, makeChatUiMessage } from '@/__tests__/helpers/factories';

import type { ChatUiMessage } from '@/features/chat/application/chatSessionLogic.pure';

// ── Mocks ────────────────────────────────────────────────────────────────────
//
// useAutoTts only consumes useTextToSpeech.togglePlayback / stopPlayback.
// Mock the underlying hook so we can assert the auto-trigger contract without
// spinning up the full TTS pipeline (network + audio player + filesystem).

const mockTogglePlayback = jest.fn((_id: string): Promise<void> => Promise.resolve());
const mockStopPlayback = jest.fn();

jest.mock('@/features/chat/application/useTextToSpeech', () => ({
  useTextToSpeech: () => ({
    togglePlayback: mockTogglePlayback,
    stopPlayback: mockStopPlayback,
    isPlaying: false,
    isLoading: false,
    activeMessageId: null,
    failedMessageId: null,
    skippedLowDataMessageId: null,
  }),
}));

import { useAutoTts } from '@/features/chat/application/useAutoTts';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useAutoTts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not trigger on first render (initial messages, no count change)', () => {
    const messages = [
      makeChatUiMessage({ id: 'u-1', role: 'user', text: 'hello' }),
      makeAssistantMessage({ id: 'a-1', text: 'hi there' }),
    ];

    renderHook(
      ({ msgs, en }: { msgs: ChatUiMessage[]; en: boolean }) =>
        useAutoTts({ messages: msgs, enabled: en }),
      {
        initialProps: { msgs: messages, en: true },
      },
    );

    expect(mockTogglePlayback).not.toHaveBeenCalled();
  });

  it('triggers togglePlayback when an assistant message is appended and enabled', () => {
    const initial = [makeChatUiMessage({ id: 'u-1', role: 'user', text: 'hello' })];
    const next = [...initial, makeAssistantMessage({ id: 'a-new', text: 'fresh assistant reply' })];

    const { rerender } = renderHook(
      ({ msgs, en }: { msgs: typeof initial; en: boolean }) =>
        useAutoTts({ messages: msgs, enabled: en }),
      { initialProps: { msgs: initial, en: true } },
    );

    rerender({ msgs: next, en: true });

    expect(mockTogglePlayback).toHaveBeenCalledTimes(1);
    expect(mockTogglePlayback).toHaveBeenCalledWith('a-new');
  });

  it('does NOT trigger when enabled = false (opt-out via user pref)', () => {
    const initial = [makeChatUiMessage({ id: 'u-1', role: 'user', text: 'hi' })];
    const next = [...initial, makeAssistantMessage({ id: 'a-new', text: 'reply' })];

    const { rerender } = renderHook(
      ({ msgs, en }: { msgs: typeof initial; en: boolean }) =>
        useAutoTts({ messages: msgs, enabled: en }),
      { initialProps: { msgs: initial, en: false } },
    );

    rerender({ msgs: next, en: false });

    expect(mockTogglePlayback).not.toHaveBeenCalled();
  });

  it('does NOT trigger when the appended message is from the user', () => {
    const initial = [makeAssistantMessage({ id: 'a-1', text: 'first reply' })];
    const next = [...initial, makeChatUiMessage({ id: 'u-2', role: 'user', text: 'follow-up' })];

    const { rerender } = renderHook(
      ({ msgs, en }: { msgs: typeof initial; en: boolean }) =>
        useAutoTts({ messages: msgs, enabled: en }),
      { initialProps: { msgs: initial, en: true } },
    );

    rerender({ msgs: next, en: true });

    expect(mockTogglePlayback).not.toHaveBeenCalled();
  });

  it('skips streaming placeholder messages (id ends with -streaming)', () => {
    const initial = [makeChatUiMessage({ id: 'u-1', role: 'user', text: 'q' })];
    const next = [
      ...initial,
      makeAssistantMessage({ id: 'a-stream-streaming', text: 'partial...' }),
    ];

    const { rerender } = renderHook(
      ({ msgs, en }: { msgs: typeof initial; en: boolean }) =>
        useAutoTts({ messages: msgs, enabled: en }),
      { initialProps: { msgs: initial, en: true } },
    );

    rerender({ msgs: next, en: true });

    expect(mockTogglePlayback).not.toHaveBeenCalled();
  });

  it('skips assistant messages with empty text (placeholder)', () => {
    const initial = [makeChatUiMessage({ id: 'u-1', role: 'user', text: 'q' })];
    const next = [...initial, makeAssistantMessage({ id: 'a-empty', text: '' })];

    const { rerender } = renderHook(
      ({ msgs, en }: { msgs: typeof initial; en: boolean }) =>
        useAutoTts({ messages: msgs, enabled: en }),
      { initialProps: { msgs: initial, en: true } },
    );

    rerender({ msgs: next, en: true });

    expect(mockTogglePlayback).not.toHaveBeenCalled();
  });

  it('does NOT double-trigger when the same messages array is rerendered without growth', () => {
    const initial = [makeChatUiMessage({ id: 'u-1', role: 'user', text: 'q' })];
    const next = [...initial, makeAssistantMessage({ id: 'a-1', text: 'reply' })];

    const { rerender } = renderHook(
      ({ msgs, en }: { msgs: typeof initial; en: boolean }) =>
        useAutoTts({ messages: msgs, enabled: en }),
      { initialProps: { msgs: initial, en: true } },
    );

    rerender({ msgs: next, en: true });
    expect(mockTogglePlayback).toHaveBeenCalledTimes(1);

    // Re-render with the same length — must NOT re-trigger.
    rerender({ msgs: [...next], en: true });
    expect(mockTogglePlayback).toHaveBeenCalledTimes(1);
  });

  it('triggers a second time when a new assistant message is appended later', () => {
    const m0 = [makeChatUiMessage({ id: 'u-1', role: 'user', text: 'a' })];
    const m1 = [...m0, makeAssistantMessage({ id: 'a-1', text: 'r1' })];
    const m2 = [...m1, makeChatUiMessage({ id: 'u-2', role: 'user', text: 'b' })];
    const m3 = [...m2, makeAssistantMessage({ id: 'a-2', text: 'r2' })];

    const { rerender } = renderHook(
      ({ msgs, en }: { msgs: typeof m0; en: boolean }) =>
        useAutoTts({ messages: msgs, enabled: en }),
      { initialProps: { msgs: m0, en: true } },
    );

    rerender({ msgs: m1, en: true });
    rerender({ msgs: m2, en: true });
    rerender({ msgs: m3, en: true });

    expect(mockTogglePlayback).toHaveBeenCalledTimes(2);
    expect(mockTogglePlayback).toHaveBeenNthCalledWith(1, 'a-1');
    expect(mockTogglePlayback).toHaveBeenNthCalledWith(2, 'a-2');
  });

  it('calls stopPlayback when enabled toggles off after auto-play started', () => {
    const initial = [makeChatUiMessage({ id: 'u-1', role: 'user', text: 'q' })];
    const next = [...initial, makeAssistantMessage({ id: 'a-1', text: 'r1' })];

    const { rerender } = renderHook(
      ({ msgs, en }: { msgs: typeof initial; en: boolean }) =>
        useAutoTts({ messages: msgs, enabled: en }),
      { initialProps: { msgs: initial, en: true } },
    );

    // Auto-play kicks in.
    rerender({ msgs: next, en: true });
    expect(mockTogglePlayback).toHaveBeenCalledTimes(1);

    // User flips the toggle off.
    rerender({ msgs: next, en: false });
    expect(mockStopPlayback).toHaveBeenCalledTimes(1);
  });

  it('does NOT call stopPlayback when toggled off if no auto-play ever ran', () => {
    const initial = [makeChatUiMessage({ id: 'u-1', role: 'user', text: 'q' })];

    const { rerender } = renderHook(
      ({ msgs, en }: { msgs: typeof initial; en: boolean }) =>
        useAutoTts({ messages: msgs, enabled: en }),
      { initialProps: { msgs: initial, en: true } },
    );

    rerender({ msgs: initial, en: false });

    expect(mockStopPlayback).not.toHaveBeenCalled();
  });

  it('exposes stopAutoPlay() that calls underlying stopPlayback', () => {
    const { result } = renderHook(() => useAutoTts({ messages: [], enabled: true }));

    act(() => {
      result.current.stopAutoPlay();
    });

    expect(mockStopPlayback).toHaveBeenCalledTimes(1);
  });

  it('cleanup on unmount calls stopPlayback', () => {
    const { unmount } = renderHook(() => useAutoTts({ messages: [], enabled: true }));

    unmount();

    expect(mockStopPlayback).toHaveBeenCalledTimes(1);
  });

  it('does NOT trigger when messages count shrinks (e.g., session reset)', () => {
    const big = [
      makeChatUiMessage({ id: 'u-1', role: 'user', text: 'q' }),
      makeAssistantMessage({ id: 'a-1', text: 'r1' }),
      makeChatUiMessage({ id: 'u-2', role: 'user', text: 'q2' }),
      makeAssistantMessage({ id: 'a-2', text: 'r2' }),
    ];
    const reset = [makeAssistantMessage({ id: 'a-fresh', text: 'fresh' })];

    const { rerender } = renderHook(
      ({ msgs, en }: { msgs: typeof big; en: boolean }) =>
        useAutoTts({ messages: msgs, enabled: en }),
      { initialProps: { msgs: big, en: true } },
    );

    rerender({ msgs: reset, en: true });

    expect(mockTogglePlayback).not.toHaveBeenCalled();
  });
});
