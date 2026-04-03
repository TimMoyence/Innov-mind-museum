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

const mockUnloadAsync = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
const mockSetOnPlaybackStatusUpdate = jest.fn<undefined, [unknown]>();

const mockSound = {
  unloadAsync: mockUnloadAsync,
  setOnPlaybackStatusUpdate: mockSetOnPlaybackStatusUpdate,
};

const mockCreateAsync = jest.fn().mockResolvedValue({ sound: mockSound });

jest.mock('expo-av', () => ({
  Audio: {
    Sound: {
      createAsync: (...args: unknown[]) => mockCreateAsync(...args),
    },
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Creates a minimal ArrayBuffer to simulate audio data. */
const makeFakeAudioBuffer = (): ArrayBuffer => {
  const encoder = new TextEncoder();
  return encoder.encode('fake-mp3-data').buffer as ArrayBuffer;
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useTextToSpeech', () => {
  const originalPlatformOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', { value: 'ios', writable: true });
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
    expect(mockCreateAsync).toHaveBeenCalledTimes(1);
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

    // Start different message — should unload old, play new
    await act(async () => {
      await result.current.togglePlayback('msg-2');
    });

    expect(mockUnloadAsync).toHaveBeenCalled();
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

    await act(async () => {
      await result.current.stopPlayback();
    });

    expect(result.current.isPlaying).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.activeMessageId).toBeNull();
  });

  it('playback status callback resets state when didJustFinish', async () => {
    mockSynthesizeSpeech.mockResolvedValue(makeFakeAudioBuffer());

    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => {
      await result.current.togglePlayback('msg-1');
    });

    // Extract the callback that was passed to setOnPlaybackStatusUpdate
    const statusCallback = mockSetOnPlaybackStatusUpdate.mock.calls[0][0] as (
      status: Record<string, unknown>,
    ) => void;

    // Simulate playback finishing
    act(() => {
      statusCallback({ isLoaded: true, didJustFinish: true });
    });

    await waitFor(() => {
      expect(result.current.isPlaying).toBe(false);
    });
    expect(result.current.activeMessageId).toBeNull();
  });

  it('playback status callback handles unloaded status', async () => {
    mockSynthesizeSpeech.mockResolvedValue(makeFakeAudioBuffer());

    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => {
      await result.current.togglePlayback('msg-1');
    });

    const statusCallback = mockSetOnPlaybackStatusUpdate.mock.calls[0][0] as (
      status: Record<string, unknown>,
    ) => void;

    // Simulate sound becoming unloaded
    act(() => {
      statusCallback({ isLoaded: false });
    });

    await waitFor(() => {
      expect(result.current.isPlaying).toBe(false);
    });
    expect(result.current.activeMessageId).toBeNull();
  });

  it('cleanup on unmount calls cleanup (no error thrown)', async () => {
    mockSynthesizeSpeech.mockResolvedValue(makeFakeAudioBuffer());

    const { result, unmount } = renderHook(() => useTextToSpeech());

    await act(async () => {
      await result.current.togglePlayback('msg-1');
    });

    // Unmount should not throw
    unmount();

    // Verify unload was attempted during cleanup
    expect(mockUnloadAsync).toHaveBeenCalled();
  });
});
