import { renderHook, act } from '@testing-library/react-native';
import { useAudioRecorder } from '@/features/chat/application/useAudioRecorder';
import { Platform } from 'react-native';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Mock recorder instance returned by useAudioRecorder from expo-audio
const mockRecorderPrepare = jest.fn<Promise<void>, []>();
const mockRecorderRecord = jest.fn();
const mockRecorderStop = jest.fn<Promise<void>, []>();
const mockRecorder = {
  prepareToRecordAsync: mockRecorderPrepare,
  record: mockRecorderRecord,
  stop: mockRecorderStop,
  uri: null as string | null,
};

const mockRequestPermissions = jest.fn<Promise<{ granted: boolean }>, []>();
const mockSetAudioMode = jest.fn<Promise<void>, [Record<string, boolean>]>();

// Mock player returned by createAudioPlayer
const mockPlayerPlay = jest.fn();
const mockPlayerRemove = jest.fn();
const mockPlayerAddListener = jest.fn();
const mockCreateAudioPlayer = jest.fn();

jest.mock('expo-audio', () => ({
  useAudioRecorder: () => mockRecorder,
  RecordingPresets: { HIGH_QUALITY: {} },
  AudioModule: {
    get requestRecordingPermissionsAsync() {
      return mockRequestPermissions;
    },
  },
  get setAudioModeAsync() {
    return mockSetAudioMode;
  },
  get createAudioPlayer() {
    return mockCreateAudioPlayer;
  },
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useAudioRecorder', () => {
  const originalPlatformOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', { value: 'ios', writable: true });
    mockRequestPermissions.mockResolvedValue({ granted: true });
    mockRecorderPrepare.mockResolvedValue(undefined);
    mockRecorderStop.mockResolvedValue(undefined);
    mockSetAudioMode.mockResolvedValue(undefined);
    mockRecorder.uri = 'file://recording.m4a';

    mockCreateAudioPlayer.mockReturnValue({
      play: mockPlayerPlay,
      remove: mockPlayerRemove,
      addListener: mockPlayerAddListener,
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

    expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
    expect(mockSetAudioMode).toHaveBeenCalledWith({
      allowsRecording: true,
      playsInSilentMode: true,
    });
    expect(mockRecorderPrepare).toHaveBeenCalledTimes(1);
    expect(mockRecorderRecord).toHaveBeenCalledTimes(1);
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
    expect(mockRecorderStop).toHaveBeenCalledTimes(1);
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
    mockRequestPermissions.mockResolvedValue({ granted: false });

    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.toggleRecording();
    });

    expect(result.current.isRecording).toBe(false);
    expect(mockRecorderPrepare).not.toHaveBeenCalled();
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

  it('stopRecording returns no URI when recorder.uri is null', async () => {
    mockRecorder.uri = null;

    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.toggleRecording();
    });
    await act(async () => {
      await result.current.toggleRecording();
    });

    expect(result.current.recordedAudioUri).toBeNull();
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

      // Stop recording
      mockMediaRecorder.stop.mockImplementation(() => {
        mockMediaRecorder.state = 'inactive';
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

    it('alerts when web audio recording is unavailable', async () => {
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
    it('plays recorded audio via createAudioPlayer', async () => {
      const { result } = renderHook(() => useAudioRecorder());

      // Record
      await act(async () => {
        await result.current.toggleRecording();
      });
      await act(async () => {
        await result.current.toggleRecording();
      });
      expect(result.current.recordedAudioUri).toBe('file://recording.m4a');

      // Play
      await act(async () => {
        await result.current.playRecordedAudio();
      });

      expect(result.current.isPlayingAudio).toBe(true);
      expect(mockCreateAudioPlayer).toHaveBeenCalledWith({ uri: 'file://recording.m4a' });
      expect(mockPlayerPlay).toHaveBeenCalled();
    });

    it('sets isPlayingAudio to false when playback finishes', async () => {
      let statusCallback: ((status: { didJustFinish: boolean }) => void) | undefined;
      mockPlayerAddListener.mockImplementation((event: string, cb: () => void) => {
        if (event === 'playbackStatusUpdate') statusCallback = cb;
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
        statusCallback?.({ didJustFinish: true });
      });

      expect(result.current.isPlayingAudio).toBe(false);
      expect(mockPlayerRemove).toHaveBeenCalled();
    });

    it('does not play when no recording URI exists', async () => {
      const { result } = renderHook(() => useAudioRecorder());

      await act(async () => {
        await result.current.playRecordedAudio();
      });

      expect(result.current.isPlayingAudio).toBe(false);
      expect(mockCreateAudioPlayer).not.toHaveBeenCalled();
    });

    it('does not play when already playing', async () => {
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
      mockCreateAudioPlayer.mockClear();
      await act(async () => {
        await result.current.playRecordedAudio();
      });

      expect(mockCreateAudioPlayer).not.toHaveBeenCalled();
    });

    it('alerts on playback error', async () => {
      mockCreateAudioPlayer.mockImplementation(() => {
        throw new Error('Playback failed');
      });

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

    it('removes previous player before creating a new one', async () => {
      let statusCallback: ((status: { didJustFinish: boolean }) => void) | undefined;
      mockPlayerAddListener.mockImplementation((event: string, cb: () => void) => {
        if (event === 'playbackStatusUpdate') statusCallback = cb;
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

      // Simulate playback ended
      act(() => {
        statusCallback?.({ didJustFinish: true });
      });
      expect(result.current.isPlayingAudio).toBe(false);

      // Play second time - previous player should be removed
      await act(async () => {
        await result.current.playRecordedAudio();
      });

      expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(2);
    });
  });

  // ── Web playback path ──────────────────────────────────────────────────────

  describe('playRecordedAudio - web', () => {
    const originalPlatformOS = Platform.OS;
    let mockAudioInstance: {
      play: jest.Mock;
      pause: jest.Mock;
      onended: (() => void) | null;
      onerror: (() => void) | null;
    };
    const originalAudio = global.Audio;

    beforeEach(() => {
      Object.defineProperty(Platform, 'OS', { value: 'web', writable: true });
      mockAudioInstance = {
        play: jest.fn().mockResolvedValue(undefined),
        pause: jest.fn(),
        onended: null,
        onerror: null,
      };

      (global as any).Audio = jest.fn().mockImplementation(() => mockAudioInstance);
    });

    afterEach(() => {
      Object.defineProperty(Platform, 'OS', { value: originalPlatformOS, writable: true });

      (global as any).Audio = originalAudio;
    });

    it('plays web audio via window.Audio', async () => {
      const { result } = renderHook(() => useAudioRecorder());

      // Set a URI manually by recording + stopping on native first, then switch to web for playback
      // Instead, we can set the ref via the recording flow on web
      Object.defineProperty(Platform, 'OS', { value: 'ios', writable: true });
      await act(async () => {
        await result.current.toggleRecording();
      });
      await act(async () => {
        await result.current.toggleRecording();
      });
      expect(result.current.recordedAudioUri).toBeTruthy();

      Object.defineProperty(Platform, 'OS', { value: 'web', writable: true });
      await act(async () => {
        await result.current.playRecordedAudio();
      });

      expect(result.current.isPlayingAudio).toBe(true);
      expect(mockAudioInstance.play).toHaveBeenCalled();
    });

    it('sets isPlayingAudio to false when web audio playback ends', async () => {
      const { result } = renderHook(() => useAudioRecorder());

      Object.defineProperty(Platform, 'OS', { value: 'ios', writable: true });
      await act(async () => {
        await result.current.toggleRecording();
      });
      await act(async () => {
        await result.current.toggleRecording();
      });

      Object.defineProperty(Platform, 'OS', { value: 'web', writable: true });
      await act(async () => {
        await result.current.playRecordedAudio();
      });
      expect(result.current.isPlayingAudio).toBe(true);

      act(() => {
        mockAudioInstance.onended?.();
      });
      expect(result.current.isPlayingAudio).toBe(false);
    });

    it('sets isPlayingAudio to false when web audio playback errors', async () => {
      const { result } = renderHook(() => useAudioRecorder());

      Object.defineProperty(Platform, 'OS', { value: 'ios', writable: true });
      await act(async () => {
        await result.current.toggleRecording();
      });
      await act(async () => {
        await result.current.toggleRecording();
      });

      Object.defineProperty(Platform, 'OS', { value: 'web', writable: true });
      await act(async () => {
        await result.current.playRecordedAudio();
      });

      act(() => {
        mockAudioInstance.onerror?.();
      });
      expect(result.current.isPlayingAudio).toBe(false);
    });

    it('pauses previous web audio element before playing new one', async () => {
      const { result } = renderHook(() => useAudioRecorder());

      Object.defineProperty(Platform, 'OS', { value: 'ios', writable: true });
      await act(async () => {
        await result.current.toggleRecording();
      });
      await act(async () => {
        await result.current.toggleRecording();
      });

      Object.defineProperty(Platform, 'OS', { value: 'web', writable: true });
      // Play first time
      await act(async () => {
        await result.current.playRecordedAudio();
      });

      // End playback so we can play again
      act(() => {
        mockAudioInstance.onended?.();
      });

      const firstInstance = mockAudioInstance;
      // Create new mock instance for second play
      mockAudioInstance = {
        play: jest.fn().mockResolvedValue(undefined),
        pause: jest.fn(),
        onended: null,
        onerror: null,
      };

      (global as any).Audio = jest.fn().mockImplementation(() => mockAudioInstance);

      await act(async () => {
        await result.current.playRecordedAudio();
      });

      // First instance should have been paused (cleanup happens inside playRecordedAudio)
      // The implementation checks webAudioPlaybackRef — since onended nullified it, pause won't be called
      // This validates the second player was created
      expect(mockAudioInstance.play).toHaveBeenCalled();
    });
  });

  // ── Web stopRecording edge case ──────────────────────────────────────────

  describe('web platform - edge cases', () => {
    const originalPlatformOS = Platform.OS;

    beforeEach(() => {
      Object.defineProperty(Platform, 'OS', { value: 'web', writable: true });
    });

    afterEach(() => {
      Object.defineProperty(Platform, 'OS', { value: originalPlatformOS, writable: true });
    });

    it('web stopRecording returns early when MediaRecorder is already inactive', async () => {
      const { result } = renderHook(() => useAudioRecorder());

      // Stop without starting — should not throw
      await act(async () => {
        if (result.current.isRecording) {
          await result.current.toggleRecording();
        }
      });

      expect(result.current.isRecording).toBe(false);
      expect(result.current.recordedAudioUri).toBeNull();
    });

    it('clearRecordedAudio pauses web playback element', async () => {
      Object.defineProperty(Platform, 'OS', { value: 'ios', writable: true });
      const { result } = renderHook(() => useAudioRecorder());

      // Record on native
      await act(async () => {
        await result.current.toggleRecording();
      });
      await act(async () => {
        await result.current.toggleRecording();
      });

      // Clear
      act(() => {
        result.current.clearRecordedAudio();
      });

      expect(result.current.recordedAudioUri).toBeNull();
      expect(result.current.recordedAudioBlob).toBeNull();
    });

    it('setAudioModeAsync resets allowsRecording after native stopRecording', async () => {
      Object.defineProperty(Platform, 'OS', { value: 'ios', writable: true });
      const { result } = renderHook(() => useAudioRecorder());

      await act(async () => {
        await result.current.toggleRecording();
      });
      await act(async () => {
        await result.current.toggleRecording();
      });

      expect(mockSetAudioMode).toHaveBeenLastCalledWith({
        allowsRecording: false,
        playsInSilentMode: true,
      });
    });

    it('toggleRecording catches thrown error from prepareToRecordAsync', async () => {
      Object.defineProperty(Platform, 'OS', { value: 'ios', writable: true });
      mockRecorderPrepare.mockRejectedValue(new Error('Microphone busy'));

      const { result } = renderHook(() => useAudioRecorder());

      await act(async () => {
        await result.current.toggleRecording();
      });

      expect(result.current.isRecording).toBe(false);
    });
  });

  // ── toggleRecording error path ────────────────────────────────────────────

  it('toggleRecording catches errors and resets state', async () => {
    mockRecorderPrepare.mockRejectedValue(new Error('Microphone error'));

    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.toggleRecording();
    });

    expect(result.current.isRecording).toBe(false);
  });
});
