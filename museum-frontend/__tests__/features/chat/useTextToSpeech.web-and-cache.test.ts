import { renderHook, act, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

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
  createAudioPlayer: (...args: unknown[]) => mockCreateAudioPlayer(...args),
}));

// expo-file-system/legacy: in-memory fake supporting a cacheDirectory + per-path
// existence map so tests can simulate cache-hit and cache-write paths.
const fsState: { exists: Record<string, boolean>; written: Record<string, string> } = {
  exists: {},
  written: {},
};
const mockGetInfoAsync = jest.fn(
  (path: string): Promise<{ exists: boolean }> => Promise.resolve({ exists: fsState.exists[path] }),
);
const mockMakeDirectoryAsync = jest.fn((path: string): Promise<void> => {
  fsState.exists[path] = true;
  return Promise.resolve();
});
const mockWriteAsStringAsync = jest.fn((path: string, data: string): Promise<void> => {
  fsState.exists[path] = true;
  fsState.written[path] = data;
  return Promise.resolve();
});

jest.mock('expo-file-system/legacy', () => ({
  get cacheDirectory() {
    return 'file:///cache/';
  },
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(args[0] as string),
  makeDirectoryAsync: (...args: unknown[]) => mockMakeDirectoryAsync(args[0] as string),
  writeAsStringAsync: (...args: unknown[]) =>
    mockWriteAsStringAsync(args[0] as string, args[1] as string),
  EncodingType: { Base64: 'base64' },
}));

import { useTextToSpeech } from '@/features/chat/application/useTextToSpeech';

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeFakeAudioBuffer = (): ArrayBuffer => {
  const encoder = new TextEncoder();
  return encoder.encode('fake-mp3-data').buffer;
};

const setPlatform = (os: 'ios' | 'android' | 'web') => {
  Object.defineProperty(Platform, 'OS', { value: os, writable: true });
};

// Minimal HTMLAudioElement-like stub.
interface AudioStub {
  play: jest.Mock;
  pause: jest.Mock;
  onended: (() => void) | null;
  onerror: (() => void) | null;
}

const installWindowAudio = () => {
  const created: AudioStub[] = [];
  const ctor = jest.fn().mockImplementation((_uri: string) => {
    const inst: AudioStub = {
      play: jest.fn().mockResolvedValue(undefined),
      pause: jest.fn(),
      onended: null,
      onerror: null,
    };
    created.push(inst);
    return inst;
  });
  // @ts-expect-error -- override for test environment
  global.window = { Audio: ctor };
  return { ctor, created };
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useTextToSpeech — web platform branch', () => {
  const originalPlatformOS = Platform.OS;
  const globalAny = global as unknown as { window?: unknown };
  const originalWindow = globalAny.window;

  beforeEach(() => {
    jest.clearAllMocks();
    fsState.exists = {};
    fsState.written = {};
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalPlatformOS, writable: true });
    globalAny.window = originalWindow;
  });

  it('uses window.Audio (not expo-audio) when Platform.OS === "web"', async () => {
    setPlatform('web');
    mockSynthesizeSpeech.mockResolvedValue(makeFakeAudioBuffer());
    const { ctor, created } = installWindowAudio();

    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => {
      await result.current.togglePlayback('msg-web-1');
    });

    expect(ctor).toHaveBeenCalledTimes(1);
    expect(ctor.mock.calls[0][0]).toMatch(/^data:audio\/mpeg;base64,/);
    expect(created[0].play).toHaveBeenCalledTimes(1);
    expect(mockCreateAudioPlayer).not.toHaveBeenCalled();
    expect(result.current.isPlaying).toBe(true);
    expect(result.current.activeMessageId).toBe('msg-web-1');
  });

  it('web: onended resets isPlaying and activeMessageId', async () => {
    setPlatform('web');
    mockSynthesizeSpeech.mockResolvedValue(makeFakeAudioBuffer());
    const { created } = installWindowAudio();

    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => {
      await result.current.togglePlayback('msg-web-2');
    });

    expect(result.current.isPlaying).toBe(true);

    act(() => {
      created[0].onended?.();
    });

    await waitFor(() => {
      expect(result.current.isPlaying).toBe(false);
    });
    expect(result.current.activeMessageId).toBeNull();
  });

  it('web: onerror resets state without throwing', async () => {
    setPlatform('web');
    mockSynthesizeSpeech.mockResolvedValue(makeFakeAudioBuffer());
    const { created } = installWindowAudio();

    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => {
      await result.current.togglePlayback('msg-web-3');
    });

    act(() => {
      created[0].onerror?.();
    });

    await waitFor(() => {
      expect(result.current.isPlaying).toBe(false);
    });
    expect(result.current.activeMessageId).toBeNull();
  });

  it('web: stopPlayback calls pause on the underlying audio element', async () => {
    setPlatform('web');
    mockSynthesizeSpeech.mockResolvedValue(makeFakeAudioBuffer());
    const { created } = installWindowAudio();

    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => {
      await result.current.togglePlayback('msg-web-4');
    });

    act(() => {
      result.current.stopPlayback();
    });

    expect(created[0].pause).toHaveBeenCalledTimes(1);
    expect(result.current.isPlaying).toBe(false);
  });

  it('web: unmount cleanup calls pause on the audio element', async () => {
    setPlatform('web');
    mockSynthesizeSpeech.mockResolvedValue(makeFakeAudioBuffer());
    const { created } = installWindowAudio();

    const { result, unmount } = renderHook(() => useTextToSpeech());

    await act(async () => {
      await result.current.togglePlayback('msg-web-5');
    });

    unmount();

    expect(created[0].pause).toHaveBeenCalled();
  });
});

describe('useTextToSpeech — native FS cache', () => {
  const originalPlatformOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    fsState.exists = {};
    fsState.written = {};
    setPlatform('ios');
    mockCreateAudioPlayer.mockReturnValue({
      play: mockPlayerPlay,
      remove: mockPlayerRemove,
      addListener: mockPlayerAddListener,
    });
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalPlatformOS, writable: true });
  });

  it('cache hit: skips chatApi.synthesizeSpeech and plays from cached path', async () => {
    // Pre-seed cache: file already on disk for this messageId.
    fsState.exists['file:///cache/tts/msg-cached.mp3'] = true;

    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => {
      await result.current.togglePlayback('msg-cached');
    });

    expect(mockSynthesizeSpeech).not.toHaveBeenCalled();
    expect(mockCreateAudioPlayer).toHaveBeenCalledWith({
      uri: 'file:///cache/tts/msg-cached.mp3',
    });
    expect(result.current.isPlaying).toBe(true);
  });

  it('cache miss: writes audio to cache then plays from written path', async () => {
    mockSynthesizeSpeech.mockResolvedValue(makeFakeAudioBuffer());

    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => {
      await result.current.togglePlayback('msg-fresh');
    });

    expect(mockSynthesizeSpeech).toHaveBeenCalledWith('msg-fresh');
    // Directory created (intermediates) since no prior dirInfo entry.
    expect(mockMakeDirectoryAsync).toHaveBeenCalledWith('file:///cache/tts/');
    expect(mockWriteAsStringAsync).toHaveBeenCalledTimes(1);
    expect(mockWriteAsStringAsync.mock.calls[0][0]).toBe('file:///cache/tts/msg-fresh.mp3');
    expect(mockCreateAudioPlayer).toHaveBeenCalledWith({
      uri: 'file:///cache/tts/msg-fresh.mp3',
    });
  });

  it('cache miss + write failure: falls back to data: URI and still plays', async () => {
    mockSynthesizeSpeech.mockResolvedValue(makeFakeAudioBuffer());
    mockWriteAsStringAsync.mockRejectedValueOnce(new Error('disk full'));

    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => {
      await result.current.togglePlayback('msg-write-fail');
    });

    expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(1);
    const arg = mockCreateAudioPlayer.mock.calls[0][0] as { uri: string };
    expect(arg.uri).toMatch(/^data:audio\/mpeg;base64,/);
    expect(result.current.isPlaying).toBe(true);
  });

  it('cache lookup error treated as miss (no throw, fetches network)', async () => {
    mockGetInfoAsync.mockRejectedValueOnce(new Error('fs unreachable'));
    mockSynthesizeSpeech.mockResolvedValue(makeFakeAudioBuffer());

    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => {
      await result.current.togglePlayback('msg-fs-error');
    });

    expect(mockSynthesizeSpeech).toHaveBeenCalledWith('msg-fs-error');
    expect(result.current.isPlaying).toBe(true);
    expect(result.current.failedMessageId).toBeNull();
  });

  it('replay-after-end: same message can be played again after didJustFinish', async () => {
    mockSynthesizeSpeech.mockResolvedValue(makeFakeAudioBuffer());
    let statusCallback: ((status: { didJustFinish: boolean }) => void) | undefined;
    mockPlayerAddListener.mockImplementation((event: string, cb: () => void) => {
      if (event === 'playbackStatusUpdate') statusCallback = cb;
    });

    const { result } = renderHook(() => useTextToSpeech());

    // First play
    await act(async () => {
      await result.current.togglePlayback('msg-replay');
    });
    expect(result.current.activeMessageId).toBe('msg-replay');

    // Finish naturally → activeMessageId resets to null
    act(() => {
      statusCallback?.({ didJustFinish: true });
    });
    await waitFor(() => {
      expect(result.current.activeMessageId).toBeNull();
    });

    // Re-toggle the same id — must NOT be treated as "stop" (since active is null)
    // and must trigger a fresh play.
    await act(async () => {
      await result.current.togglePlayback('msg-replay');
    });

    expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(2);
    expect(result.current.isPlaying).toBe(true);
    expect(result.current.activeMessageId).toBe('msg-replay');
  });
});
