import { renderHook, act, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { useTextToSpeech } from '@/features/chat/application/useTextToSpeech';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockSynthesizeSpeech = jest.fn<Promise<ArrayBuffer | null>, [string]>();

jest.mock('@/features/chat/infrastructure/chatApi', () => ({
  chatApi: {
    synthesizeSpeech: (...args: unknown[]) => mockSynthesizeSpeech(args[0] as string),
  },
}));

const mockPlayerPlay = jest.fn();
const mockPlayerRemove = jest.fn();
const mockPlayerAddListener = jest.fn();

const mockCreateAudioPlayer = jest.fn().mockReturnValue({
  play: mockPlayerPlay,
  remove: mockPlayerRemove,
  addListener: mockPlayerAddListener,
});

jest.mock('expo-audio', () => ({
  get createAudioPlayer() {
    return mockCreateAudioPlayer;
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Creates a minimal ArrayBuffer to simulate audio data. */
const makeFakeAudioBuffer = (): ArrayBuffer => {
  const encoder = new TextEncoder();
  return encoder.encode('fake-mp3-data').buffer;
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useTextToSpeech', () => {
  const originalPlatformOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', { value: 'ios', writable: true });
    mockCreateAudioPlayer.mockReturnValue({
      play: mockPlayerPlay,
      remove: mockPlayerRemove,
      addListener: mockPlayerAddListener,
    });
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalPlatformOS, writable: true });
  });

  it('initialises with idle state', () => {
    const { result } = renderHook(() => useTextToSpeech());

    expect(result.current.isPlaying).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.activeMessageId).toBeNull();
  });

  it('togglePlayback starts audio for a message', async () => {
    mockSynthesizeSpeech.mockResolvedValue(makeFakeAudioBuffer());

    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => {
      await result.current.togglePlayback('msg-1');
    });

    expect(mockSynthesizeSpeech).toHaveBeenCalledWith('msg-1');
    expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(1);
    expect(mockPlayerPlay).toHaveBeenCalled();
    expect(result.current.isPlaying).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.activeMessageId).toBe('msg-1');
  });

  it('togglePlayback on same message stops playback', async () => {
    mockSynthesizeSpeech.mockResolvedValue(makeFakeAudioBuffer());

    const { result } = renderHook(() => useTextToSpeech());

    // Start playback
    await act(async () => {
      await result.current.togglePlayback('msg-1');
    });

    expect(result.current.isPlaying).toBe(true);

    // Toggle same message — should stop
    await act(async () => {
      await result.current.togglePlayback('msg-1');
    });

    expect(result.current.isPlaying).toBe(false);
    expect(result.current.activeMessageId).toBeNull();
  });

  it('stops existing playback before playing a new message', async () => {
    mockSynthesizeSpeech.mockResolvedValue(makeFakeAudioBuffer());

    const { result } = renderHook(() => useTextToSpeech());

    // Start first message
    await act(async () => {
      await result.current.togglePlayback('msg-1');
    });

    expect(result.current.activeMessageId).toBe('msg-1');

    // Start different message — should remove old player, play new
    await act(async () => {
      await result.current.togglePlayback('msg-2');
    });

    expect(mockPlayerRemove).toHaveBeenCalled();
    expect(result.current.activeMessageId).toBe('msg-2');
    expect(result.current.isPlaying).toBe(true);
  });

  it('handles null audio response (204 / empty)', async () => {
    mockSynthesizeSpeech.mockResolvedValue(null);

    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => {
      await result.current.togglePlayback('msg-1');
    });

    expect(result.current.isPlaying).toBe(false);
    expect(result.current.activeMessageId).toBeNull();
  });

  it('recovers from API errors silently', async () => {
    mockSynthesizeSpeech.mockRejectedValue(new Error('501 TTS unavailable'));

    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => {
      await result.current.togglePlayback('msg-1');
    });

    expect(result.current.isPlaying).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.activeMessageId).toBeNull();
  });

  it('stopPlayback resets all state', async () => {
    mockSynthesizeSpeech.mockResolvedValue(makeFakeAudioBuffer());

    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => {
      await result.current.togglePlayback('msg-1');
    });

    expect(result.current.isPlaying).toBe(true);

    act(() => {
      result.current.stopPlayback();
    });

    expect(result.current.isPlaying).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.activeMessageId).toBeNull();
  });

  it('playToEnd event resets state when playback finishes', async () => {
    mockSynthesizeSpeech.mockResolvedValue(makeFakeAudioBuffer());
    let statusCallback: ((status: { didJustFinish: boolean }) => void) | undefined;
    mockPlayerAddListener.mockImplementation((event: string, cb: () => void) => {
      if (event === 'playbackStatusUpdate') statusCallback = cb;
    });

    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => {
      await result.current.togglePlayback('msg-1');
    });

    // Simulate playback finishing
    act(() => {
      statusCallback?.({ didJustFinish: true });
    });

    await waitFor(() => {
      expect(result.current.isPlaying).toBe(false);
    });
    expect(result.current.activeMessageId).toBeNull();
    expect(mockPlayerRemove).toHaveBeenCalled();
  });

  it('cleanup on unmount calls remove (no error thrown)', async () => {
    mockSynthesizeSpeech.mockResolvedValue(makeFakeAudioBuffer());

    const { result, unmount } = renderHook(() => useTextToSpeech());

    await act(async () => {
      await result.current.togglePlayback('msg-1');
    });

    // Unmount should not throw
    unmount();

    expect(mockPlayerRemove).toHaveBeenCalled();
  });
});
