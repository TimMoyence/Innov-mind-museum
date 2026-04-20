import { renderHook, act, waitFor } from '@testing-library/react-native';

import {
  setCurrentDataMode,
  __resetDataModeForTests,
} from '@/shared/infrastructure/dataMode/currentDataMode';

const mockSynthesizeSpeech = jest.fn();
const mockCreateAudioPlayer = jest.fn();

jest.mock('@/features/chat/infrastructure/chatApi', () => ({
  chatApi: {
    synthesizeSpeech: (...args: unknown[]) => mockSynthesizeSpeech(...args),
  },
}));

jest.mock('expo-audio', () => ({
  createAudioPlayer: (...args: unknown[]) => mockCreateAudioPlayer(...args),
}));

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: null,
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false }),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  EncodingType: { Base64: 'base64' },
}));

import { useTextToSpeech } from '@/features/chat/application/useTextToSpeech';

describe('useTextToSpeech — low data mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetDataModeForTests();
  });

  it('skips network synthesis when low-data and cache is empty', async () => {
    setCurrentDataMode('low');

    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => {
      await result.current.togglePlayback('msg-1');
    });

    expect(mockSynthesizeSpeech).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(result.current.skippedLowDataMessageId).toBe('msg-1');
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isPlaying).toBe(false);
  });

  it('hits the network when data mode is normal', async () => {
    setCurrentDataMode('normal');
    mockSynthesizeSpeech.mockResolvedValue(null); // 204 — no audio

    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => {
      await result.current.togglePlayback('msg-2');
    });

    expect(mockSynthesizeSpeech).toHaveBeenCalledWith('msg-2');
    await waitFor(() => {
      expect(result.current.skippedLowDataMessageId).toBeNull();
    });
  });

  it('clears skippedLowDataMessageId on subsequent toggle', async () => {
    setCurrentDataMode('low');
    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => {
      await result.current.togglePlayback('msg-3');
    });
    expect(result.current.skippedLowDataMessageId).toBe('msg-3');

    setCurrentDataMode('normal');
    mockSynthesizeSpeech.mockResolvedValue(null);

    await act(async () => {
      await result.current.togglePlayback('msg-4');
    });

    expect(result.current.skippedLowDataMessageId).toBeNull();
  });
});
