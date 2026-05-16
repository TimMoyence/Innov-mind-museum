/**
 * A5 corrective loop 1 — `useAutoTts.loading` signal exposure (R16 wire).
 *
 * Asserts that the hook surfaces the underlying `useTextToSpeech.isLoading`
 * state so the chat screen can wire it through `useStatusPhase({ ttsPending })`
 * and render the `synthesizing-voice` phase in `<StatusIndicator>`.
 *
 * Spec : `docs/chat-ux-refonte/specs/A5.md` §1.2 R16 + review I2.
 */

import { renderHook } from '@testing-library/react-native';

let mockIsLoading = false;
const mockTogglePlayback = jest.fn((_id: string): Promise<void> => Promise.resolve());
const mockStopPlayback = jest.fn();

jest.mock('@/features/chat/application/useTextToSpeech', () => ({
  useTextToSpeech: () => ({
    togglePlayback: mockTogglePlayback,
    stopPlayback: mockStopPlayback,
    isPlaying: false,
    isLoading: mockIsLoading,
    activeMessageId: null,
    failedMessageId: null,
    skippedLowDataMessageId: null,
  }),
}));

import { useAutoTts } from '@/features/chat/application/useAutoTts';

describe('useAutoTts — loading signal (R16 ttsPending wire)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsLoading = false;
  });

  it('exposes loading=false when TTS is idle and audio description is enabled', () => {
    mockIsLoading = false;

    const { result } = renderHook(() => useAutoTts({ messages: [], enabled: true }));

    expect(result.current.loading).toBe(false);
  });

  it('exposes loading=true while the underlying TTS is fetching audio (enabled=true)', () => {
    mockIsLoading = true;

    const { result } = renderHook(() => useAutoTts({ messages: [], enabled: true }));

    expect(result.current.loading).toBe(true);
  });

  it('gates loading behind `enabled` so a stale isLoading does not leak when audio desc is off', () => {
    // Scenario : user just toggled audio description off, but the underlying
    // useTextToSpeech is still reporting isLoading=true mid-request. The
    // screen must NOT show `synthesizing-voice` in that case.
    mockIsLoading = true;

    const { result } = renderHook(() => useAutoTts({ messages: [], enabled: false }));

    expect(result.current.loading).toBe(false);
  });

  it('flips loading false → true → false in sync with the underlying TTS state', () => {
    mockIsLoading = false;

    const { result, rerender } = renderHook(
      ({ en }: { en: boolean }) => useAutoTts({ messages: [], enabled: en }),
      { initialProps: { en: true } },
    );
    expect(result.current.loading).toBe(false);

    // TTS request starts.
    mockIsLoading = true;
    rerender({ en: true });
    expect(result.current.loading).toBe(true);

    // TTS request resolves.
    mockIsLoading = false;
    rerender({ en: true });
    expect(result.current.loading).toBe(false);
  });

  it('preserves the stopAutoPlay return value (existing contract not regressed)', () => {
    const { result } = renderHook(() => useAutoTts({ messages: [], enabled: true }));

    expect(typeof result.current.stopAutoPlay).toBe('function');
    expect('loading' in result.current).toBe(true);
  });
});
