import { renderHook, act } from '@testing-library/react-native';
import { useAudioRecorder } from '@/features/chat/application/useAudioRecorder';
import { Platform } from 'react-native';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Shared mock fn references — class instances bind to these via prototype
const mockStopAndUnloadAsync = jest.fn<Promise<void>, []>();
const mockGetURI = jest.fn<string | null, []>();
const mockGetStatusAsync = jest.fn();
const mockRequestPermissionsAsync = jest.fn<Promise<{ granted: boolean }>, []>();
const mockSetAudioModeAsync = jest.fn<Promise<void>, [Record<string, boolean>]>();
const mockSoundCreateAsync = jest.fn();
const mockRecordingCreateAsync = jest.fn();

jest.mock('expo-av', () => {
  // Build the Recording "class" inside the factory so it captures mock fns via closure
  function Recording(this: Record<string, unknown>) {
    this.stopAndUnloadAsync = mockStopAndUnloadAsync;
    this.getURI = mockGetURI;
  }

  Recording.createAsync = (...args: unknown[]) => mockRecordingCreateAsync(...args);

  return {
    Audio: {
      get requestPermissionsAsync() {
        return mockRequestPermissionsAsync;
      },
      get setAudioModeAsync() {
        return mockSetAudioModeAsync;
      },
      Recording,
      RecordingOptionsPresets: {
        HIGH_QUALITY: {},
      },
      Sound: {
        get createAsync() {
          return mockSoundCreateAsync;
        },
      },
    },
  };
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useAudioRecorder', () => {
  const originalPlatformOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    // Default to native (iOS) platform for tests
    Object.defineProperty(Platform, 'OS', { value: 'ios', writable: true });
    mockRequestPermissionsAsync.mockResolvedValue({ granted: true });
    mockStopAndUnloadAsync.mockResolvedValue(undefined);
    mockSetAudioModeAsync.mockResolvedValue(undefined);
    mockGetURI.mockReturnValue('file://recording.m4a');
    mockGetStatusAsync.mockResolvedValue({ isRecording: true });
    mockRecordingCreateAsync.mockResolvedValue({
      recording: {
        stopAndUnloadAsync: mockStopAndUnloadAsync,
        getURI: mockGetURI,
        getStatusAsync: mockGetStatusAsync,
      },
    });
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { value: originalPlatformOS, writable: true });
  });

  it('initialises with isRecording=false and no recorded audio', () => {
    const { result } = renderHook(() => useAudioRecorder());

    expect(result.current.isRecording).toBe(false);
    expect(result.current.recordedAudioUri).toBeNull();
    expect(result.current.recordedAudioBlob).toBeNull();
    expect(result.current.isPlayingAudio).toBe(false);
  });

  it('toggleRecording() requests permissions and starts recording on native', async () => {
    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.toggleRecording();
    });

    expect(mockRequestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mockSetAudioModeAsync).toHaveBeenCalledWith({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });
    expect(mockRecordingCreateAsync).toHaveBeenCalledTimes(1);
    expect(result.current.isRecording).toBe(true);
  });

  it('toggleRecording() stops recording and sets recordedAudioUri', async () => {
    const { result } = renderHook(() => useAudioRecorder());

    // Start
    await act(async () => {
      await result.current.toggleRecording();
    });
    expect(result.current.isRecording).toBe(true);

    // Stop
    await act(async () => {
      await result.current.toggleRecording();
    });

    expect(result.current.isRecording).toBe(false);
    expect(mockStopAndUnloadAsync).toHaveBeenCalledTimes(1);
    expect(result.current.recordedAudioUri).toBe('file://recording.m4a');
  });

  it('isRecording transitions: false -> true -> false', async () => {
    const { result } = renderHook(() => useAudioRecorder());

    expect(result.current.isRecording).toBe(false);

    await act(async () => {
      await result.current.toggleRecording();
    });
    expect(result.current.isRecording).toBe(true);

    await act(async () => {
      await result.current.toggleRecording();
    });
    expect(result.current.isRecording).toBe(false);
  });

  it('does not start recording when permissions are denied', async () => {
    mockRequestPermissionsAsync.mockResolvedValue({ granted: false });

    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.toggleRecording();
    });

    expect(result.current.isRecording).toBe(false);
    expect(mockRecordingCreateAsync).not.toHaveBeenCalled();
  });

  it('clearRecordedAudio() resets audio state', async () => {
    const { result } = renderHook(() => useAudioRecorder());

    // Record something
    await act(async () => {
      await result.current.toggleRecording();
    });
    await act(async () => {
      await result.current.toggleRecording();
    });
    expect(result.current.recordedAudioUri).toBe('file://recording.m4a');

    // Clear it
    act(() => {
      result.current.clearRecordedAudio();
    });

    expect(result.current.recordedAudioUri).toBeNull();
    expect(result.current.recordedAudioBlob).toBeNull();
  });

  it('stopRecording returns no URI when getURI returns null', async () => {
    mockGetURI.mockReturnValue(null);

    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.toggleRecording();
    });
    await act(async () => {
      await result.current.toggleRecording();
    });

    expect(result.current.recordedAudioUri).toBeNull();
  });

  // ── Recording failed to start ───────────────────────────────────────────

  it('throws and alerts when recording fails to start (isRecording=false status)', async () => {
    mockGetStatusAsync.mockResolvedValue({ isRecording: false });
    mockRecordingCreateAsync.mockResolvedValue({
      recording: {
        stopAndUnloadAsync: mockStopAndUnloadAsync,
        getURI: mockGetURI,
        getStatusAsync: mockGetStatusAsync,
      },
    });

    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.toggleRecording();
    });

    // toggleRecording catches the error and alerts
    expect(result.current.isRecording).toBe(false);
  });

  // ── Web platform recording path ─────────────────────────────────────────

  describe('web platform', () => {
    let mockMediaRecorder: {
      start: jest.Mock;
      stop: jest.Mock;
      state: string;
      mimeType: string;
      ondataavailable: ((event: { data: Blob }) => void) | null;
      onstop: (() => void) | null;
    };
    let mockMediaStream: {
      getTracks: jest.Mock;
    };
    const originalNavigator = global.navigator;
    const originalMediaRecorder = global.MediaRecorder;
    const originalURL = global.URL;

    beforeEach(() => {
      Object.defineProperty(Platform, 'OS', { value: 'web', writable: true });

      mockMediaStream = {
        getTracks: jest.fn().mockReturnValue([{ stop: jest.fn() }]),
      };

      mockMediaRecorder = {
        start: jest.fn(),
        stop: jest.fn(),
        state: 'recording',
        mimeType: 'audio/webm',
        ondataavailable: null,
        onstop: null,
      };

      Object.defineProperty(global, 'navigator', {
        value: {
          mediaDevices: {
            getUserMedia: jest.fn().mockResolvedValue(mockMediaStream),
          },
        },
        writable: true,
        configurable: true,
      });

      Object.defineProperty(global, 'MediaRecorder', {
        value: jest.fn().mockImplementation(() => mockMediaRecorder),
        writable: true,
        configurable: true,
      });

      Object.defineProperty(global, 'URL', {
        value: {
          createObjectURL: jest.fn().mockReturnValue('blob:http://localhost/audio-url'),
          revokeObjectURL: jest.fn(),
        },
        writable: true,
        configurable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(global, 'navigator', {
        value: originalNavigator,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(global, 'MediaRecorder', {
        value: originalMediaRecorder,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(global, 'URL', {
        value: originalURL,
        writable: true,
        configurable: true,
      });
    });

    it('starts web recording via MediaRecorder', async () => {
      const { result } = renderHook(() => useAudioRecorder());

      await act(async () => {
        await result.current.toggleRecording();
      });

      expect(result.current.isRecording).toBe(true);
      expect(mockMediaRecorder.start).toHaveBeenCalled();
    });

    it('stops web recording and produces a blob URI', async () => {
      const { result } = renderHook(() => useAudioRecorder());

      // Start recording
      await act(async () => {
        await result.current.toggleRecording();
      });

      // Simulate data available
      const fakeBlob = new Blob(['audio-chunk'], { type: 'audio/webm' });
      act(() => {
        mockMediaRecorder.ondataavailable?.({ data: fakeBlob });
      });

      // Stop recording - the stop mock needs to trigger onstop
      mockMediaRecorder.stop.mockImplementation(() => {
        mockMediaRecorder.state = 'inactive';
        // Trigger onstop asynchronously
        Promise.resolve().then(() => {
          mockMediaRecorder.onstop?.();
        });
      });

      await act(async () => {
        await result.current.toggleRecording();
      });

      expect(result.current.isRecording).toBe(false);
      expect(result.current.recordedAudioUri).toBe('blob:http://localhost/audio-url');
      expect(result.current.recordedAudioBlob).toBeTruthy();
    });

    it('web stopRecording returns early when MediaRecorder is already inactive', async () => {
      const { result } = renderHook(() => useAudioRecorder());

      // Start recording on web
      await act(async () => {
        await result.current.toggleRecording();
      });
      expect(result.current.isRecording).toBe(true);

      // Simulate MediaRecorder becoming inactive externally
      mockMediaRecorder.state = 'inactive';

      await act(async () => {
        await result.current.toggleRecording();
      });

      // stopRecording returns early without changing isRecording state
      // because it exits at line 138-139 of the source
      // The toggleRecording catch block then resets isRecording to false
      // either way, the recorder is not updated
      expect(mockMediaRecorder.stop).not.toHaveBeenCalled();
    });

    it('alerts when web audio recording is unavailable', async () => {
      // Remove getUserMedia to simulate unavailability
      Object.defineProperty(global, 'navigator', {
        value: { mediaDevices: {} },
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useAudioRecorder());

      await act(async () => {
        await result.current.toggleRecording();
      });

      expect(result.current.isRecording).toBe(false);
    });
  });

  // ── Playback on native ────────────────────────────────────────────────────

  describe('playRecordedAudio - native', () => {
    it('plays recorded audio via Audio.Sound.createAsync', async () => {
      const mockUnloadAsync = jest.fn().mockResolvedValue(undefined);
      const mockSetOnPlaybackStatusUpdate = jest.fn();

      mockSoundCreateAsync.mockResolvedValue({
        sound: {
          setOnPlaybackStatusUpdate: mockSetOnPlaybackStatusUpdate,
          unloadAsync: mockUnloadAsync,
        },
      });

      const { result } = renderHook(() => useAudioRecorder());

      // Record something first
      await act(async () => {
        await result.current.toggleRecording();
      });
      await act(async () => {
        await result.current.toggleRecording();
      });

      expect(result.current.recordedAudioUri).toBe('file://recording.m4a');

      // Play it
      await act(async () => {
        await result.current.playRecordedAudio();
      });

      expect(result.current.isPlayingAudio).toBe(true);
      expect(mockSoundCreateAsync).toHaveBeenCalledWith(
        { uri: 'file://recording.m4a' },
        { shouldPlay: true },
      );
    });

    it('sets isPlayingAudio to false when playback finishes', async () => {
      const mockUnloadAsync = jest.fn().mockResolvedValue(undefined);
      let statusCallback: ((status: Record<string, unknown>) => void) | undefined;
      const mockSetOnPlaybackStatusUpdate = jest
        .fn()
        .mockImplementation((cb: (status: Record<string, unknown>) => void) => {
          statusCallback = cb;
        });

      mockSoundCreateAsync.mockResolvedValue({
        sound: {
          setOnPlaybackStatusUpdate: mockSetOnPlaybackStatusUpdate,
          unloadAsync: mockUnloadAsync,
        },
      });

      const { result } = renderHook(() => useAudioRecorder());

      // Record
      await act(async () => {
        await result.current.toggleRecording();
      });
      await act(async () => {
        await result.current.toggleRecording();
      });

      // Play
      await act(async () => {
        await result.current.playRecordedAudio();
      });
      expect(result.current.isPlayingAudio).toBe(true);

      // Simulate playback finished
      act(() => {
        statusCallback?.({ isLoaded: true, didJustFinish: true });
      });

      expect(result.current.isPlayingAudio).toBe(false);
    });

    it('sets isPlayingAudio to false when sound is not loaded', async () => {
      const mockUnloadAsync = jest.fn().mockResolvedValue(undefined);
      let statusCallback: ((status: Record<string, unknown>) => void) | undefined;
      const mockSetOnPlaybackStatusUpdate = jest
        .fn()
        .mockImplementation((cb: (status: Record<string, unknown>) => void) => {
          statusCallback = cb;
        });

      mockSoundCreateAsync.mockResolvedValue({
        sound: {
          setOnPlaybackStatusUpdate: mockSetOnPlaybackStatusUpdate,
          unloadAsync: mockUnloadAsync,
        },
      });

      const { result } = renderHook(() => useAudioRecorder());

      await act(async () => {
        await result.current.toggleRecording();
      });
      await act(async () => {
        await result.current.toggleRecording();
      });
      await act(async () => {
        await result.current.playRecordedAudio();
      });

      // Simulate sound unloaded
      act(() => {
        statusCallback?.({ isLoaded: false });
      });

      expect(result.current.isPlayingAudio).toBe(false);
    });

    it('does not play when no recording URI exists', async () => {
      const { result } = renderHook(() => useAudioRecorder());

      await act(async () => {
        await result.current.playRecordedAudio();
      });

      expect(result.current.isPlayingAudio).toBe(false);
      expect(mockSoundCreateAsync).not.toHaveBeenCalled();
    });

    it('does not play when already playing', async () => {
      const mockSetOnPlaybackStatusUpdate = jest.fn();
      const mockUnloadAsync = jest.fn().mockResolvedValue(undefined);

      mockSoundCreateAsync.mockResolvedValue({
        sound: {
          setOnPlaybackStatusUpdate: mockSetOnPlaybackStatusUpdate,
          unloadAsync: mockUnloadAsync,
        },
      });

      const { result } = renderHook(() => useAudioRecorder());

      // Record
      await act(async () => {
        await result.current.toggleRecording();
      });
      await act(async () => {
        await result.current.toggleRecording();
      });

      // Play first time
      await act(async () => {
        await result.current.playRecordedAudio();
      });
      expect(result.current.isPlayingAudio).toBe(true);

      // Try playing again - should be a no-op
      mockSoundCreateAsync.mockClear();
      await act(async () => {
        await result.current.playRecordedAudio();
      });

      expect(mockSoundCreateAsync).not.toHaveBeenCalled();
    });

    it('alerts on playback error', async () => {
      mockSoundCreateAsync.mockRejectedValue(new Error('Playback failed'));

      const { result } = renderHook(() => useAudioRecorder());

      // Record
      await act(async () => {
        await result.current.toggleRecording();
      });
      await act(async () => {
        await result.current.toggleRecording();
      });

      // Play - should catch and alert
      await act(async () => {
        await result.current.playRecordedAudio();
      });

      expect(result.current.isPlayingAudio).toBe(false);
    });
  });

  // ── Playback on web ──────────────────────────────────────────────────────

  describe('playRecordedAudio - web', () => {
    const originalPlatformOS = Platform.OS;
    let mockAudioElement: {
      play: jest.Mock;
      pause: jest.Mock;
      onended: (() => void) | null;
      onerror: (() => void) | null;
    };
    const originalAudio = global.Audio;

    beforeEach(() => {
      Object.defineProperty(Platform, 'OS', { value: 'web', writable: true });

      mockAudioElement = {
        play: jest.fn().mockResolvedValue(undefined),
        pause: jest.fn(),
        onended: null,
        onerror: null,
      };

      // Mock window.Audio constructor
      (global as Record<string, unknown>).Audio = jest
        .fn()
        .mockImplementation(() => mockAudioElement);

      // Mock URL for web recording cleanup
      Object.defineProperty(global, 'URL', {
        value: {
          createObjectURL: jest.fn().mockReturnValue('blob:http://localhost/audio-url'),
          revokeObjectURL: jest.fn(),
        },
        writable: true,
        configurable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(Platform, 'OS', { value: originalPlatformOS, writable: true });
      (global as Record<string, unknown>).Audio = originalAudio;
    });

    it('plays audio via window.Audio on web platform', async () => {
      const { result } = renderHook(() => useAudioRecorder());

      // Simulate having a recorded audio URI by starting/stopping on native first,
      // then switching to web for playback. Instead, set up web recording mocks.
      // For simplicity, switch to native to record, then back to web to play.
      Object.defineProperty(Platform, 'OS', { value: 'ios', writable: true });

      // Record on native
      await act(async () => {
        await result.current.toggleRecording();
      });
      await act(async () => {
        await result.current.toggleRecording();
      });
      expect(result.current.recordedAudioUri).toBe('file://recording.m4a');

      // Switch to web for playback
      Object.defineProperty(Platform, 'OS', { value: 'web', writable: true });

      await act(async () => {
        await result.current.playRecordedAudio();
      });

      expect(result.current.isPlayingAudio).toBe(true);
      expect(mockAudioElement.play).toHaveBeenCalled();
    });

    it('sets isPlayingAudio to false when web audio playback ends', async () => {
      const { result } = renderHook(() => useAudioRecorder());

      // Record on native
      Object.defineProperty(Platform, 'OS', { value: 'ios', writable: true });
      await act(async () => {
        await result.current.toggleRecording();
      });
      await act(async () => {
        await result.current.toggleRecording();
      });

      // Play on web
      Object.defineProperty(Platform, 'OS', { value: 'web', writable: true });
      await act(async () => {
        await result.current.playRecordedAudio();
      });
      expect(result.current.isPlayingAudio).toBe(true);

      // Simulate playback ended
      act(() => {
        mockAudioElement.onended?.();
      });

      expect(result.current.isPlayingAudio).toBe(false);
    });

    it('sets isPlayingAudio to false when web audio playback errors', async () => {
      const { result } = renderHook(() => useAudioRecorder());

      // Record on native
      Object.defineProperty(Platform, 'OS', { value: 'ios', writable: true });
      await act(async () => {
        await result.current.toggleRecording();
      });
      await act(async () => {
        await result.current.toggleRecording();
      });

      // Play on web
      Object.defineProperty(Platform, 'OS', { value: 'web', writable: true });
      await act(async () => {
        await result.current.playRecordedAudio();
      });
      expect(result.current.isPlayingAudio).toBe(true);

      // Simulate playback error
      act(() => {
        mockAudioElement.onerror?.();
      });

      expect(result.current.isPlayingAudio).toBe(false);
    });

    it('clearRecordedAudio pauses web playback element', async () => {
      const { result } = renderHook(() => useAudioRecorder());

      // Record on native
      Object.defineProperty(Platform, 'OS', { value: 'ios', writable: true });
      await act(async () => {
        await result.current.toggleRecording();
      });
      await act(async () => {
        await result.current.toggleRecording();
      });

      // Play on web
      Object.defineProperty(Platform, 'OS', { value: 'web', writable: true });
      await act(async () => {
        await result.current.playRecordedAudio();
      });

      // Clear - should pause the web audio playback
      act(() => {
        result.current.clearRecordedAudio();
      });

      expect(mockAudioElement.pause).toHaveBeenCalled();
      expect(result.current.recordedAudioUri).toBeNull();
      expect(result.current.recordedAudioBlob).toBeNull();
    });
  });

  // ── toggleRecording error path ────────────────────────────────────────────

  it('toggleRecording catches errors and resets state', async () => {
    mockRecordingCreateAsync.mockRejectedValue(new Error('Microphone error'));

    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.toggleRecording();
    });

    expect(result.current.isRecording).toBe(false);
  });

  // ── Unload previous sound before creating new one ─────────────────────────

  it('unloads previous native playback sound before playing again', async () => {
    const mockUnloadAsync1 = jest.fn().mockResolvedValue(undefined);
    const mockSetOnPlaybackStatusUpdate1 = jest.fn();
    let statusCallback1: ((status: Record<string, unknown>) => void) | undefined;
    mockSetOnPlaybackStatusUpdate1.mockImplementation(
      (cb: (status: Record<string, unknown>) => void) => {
        statusCallback1 = cb;
      },
    );

    const mockUnloadAsync2 = jest.fn().mockResolvedValue(undefined);
    const mockSetOnPlaybackStatusUpdate2 = jest.fn();

    mockSoundCreateAsync
      .mockResolvedValueOnce({
        sound: {
          setOnPlaybackStatusUpdate: mockSetOnPlaybackStatusUpdate1,
          unloadAsync: mockUnloadAsync1,
        },
      })
      .mockResolvedValueOnce({
        sound: {
          setOnPlaybackStatusUpdate: mockSetOnPlaybackStatusUpdate2,
          unloadAsync: mockUnloadAsync2,
        },
      });

    const { result } = renderHook(() => useAudioRecorder());

    // Record
    await act(async () => {
      await result.current.toggleRecording();
    });
    await act(async () => {
      await result.current.toggleRecording();
    });

    // Play first time
    await act(async () => {
      await result.current.playRecordedAudio();
    });

    // Simulate playback ended so isPlayingAudio goes false
    act(() => {
      statusCallback1?.({ isLoaded: true, didJustFinish: true });
    });
    expect(result.current.isPlayingAudio).toBe(false);

    // Play second time - should unload previous sound
    await act(async () => {
      await result.current.playRecordedAudio();
    });

    expect(mockUnloadAsync1).toHaveBeenCalled();
    expect(mockSoundCreateAsync).toHaveBeenCalledTimes(2);
  });
});
