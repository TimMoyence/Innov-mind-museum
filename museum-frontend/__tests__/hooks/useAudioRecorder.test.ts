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
const mockPrepareToRecordAsync = jest.fn<Promise<void>, [Record<string, unknown>]>();
const mockStartAsync = jest.fn<Promise<void>, []>();
const mockStopAndUnloadAsync = jest.fn<Promise<void>, []>();
const mockGetURI = jest.fn<string | null, []>();
const mockRequestPermissionsAsync = jest.fn<Promise<{ granted: boolean }>, []>();
const mockSetAudioModeAsync = jest.fn<Promise<void>, [Record<string, boolean>]>();
const mockCreateAsync = jest.fn();

jest.mock('expo-av', () => {
  // Build the Recording "class" inside the factory so it captures mock fns via closure
  function Recording(this: Record<string, unknown>) {
    this.prepareToRecordAsync = mockPrepareToRecordAsync;
    this.startAsync = mockStartAsync;
    this.stopAndUnloadAsync = mockStopAndUnloadAsync;
    this.getURI = mockGetURI;
  }

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
          return mockCreateAsync;
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
    mockPrepareToRecordAsync.mockResolvedValue(undefined);
    mockStartAsync.mockResolvedValue(undefined);
    mockStopAndUnloadAsync.mockResolvedValue(undefined);
    mockSetAudioModeAsync.mockResolvedValue(undefined);
    mockGetURI.mockReturnValue('file://recording.m4a');
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
    expect(mockPrepareToRecordAsync).toHaveBeenCalledTimes(1);
    expect(mockStartAsync).toHaveBeenCalledTimes(1);
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
    expect(mockPrepareToRecordAsync).not.toHaveBeenCalled();
    expect(mockStartAsync).not.toHaveBeenCalled();
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
});
