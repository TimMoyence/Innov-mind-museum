import { act, renderHook, waitFor } from '@testing-library/react-native';

import type { create as ZustandCreate } from 'zustand';

const mockNetInfoFetch = jest.fn();
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: (...args: unknown[]) => mockNetInfoFetch(...args) },
}));

jest.mock('@/features/museum/infrastructure/offlinePackChoiceStore', () => {
  const { create } = require('zustand') as { create: typeof ZustandCreate };
  const mockStore = create<{
    choices: Record<string, { decision: 'accepted' | 'declined'; recordedAt: string }>;
    acceptOfflinePack: (cityId: string) => void;
    declineOfflinePack: (cityId: string) => void;
  }>()((set) => ({
    choices: {},
    acceptOfflinePack: (cityId: string) => {
      set((s) => ({
        choices: {
          ...s.choices,
          [cityId]: { decision: 'accepted', recordedAt: new Date().toISOString() },
        },
      }));
    },
    declineOfflinePack: (cityId: string) => {
      set((s) => ({
        choices: {
          ...s.choices,
          [cityId]: { decision: 'declined', recordedAt: new Date().toISOString() },
        },
      }));
    },
  }));
  return { useOfflinePackChoiceStore: mockStore };
});

import { useOfflinePackPromptTrigger } from '@/features/museum/application/useOfflinePackPromptTrigger';
import { useOfflinePackChoiceStore } from '@/features/museum/infrastructure/offlinePackChoiceStore';

const PARIS_CITY = { cityId: 'paris', cityName: 'Paris' } as const;

const resetStore = () => {
  useOfflinePackChoiceStore.setState({ choices: {} });
};

describe('useOfflinePackPromptTrigger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStore();
    mockNetInfoFetch.mockResolvedValue({ type: 'wifi', isConnected: true, details: null });
  });

  it('sets visible=true when nearestCity is non-null, no choice yet, and NetInfo reports wifi', async () => {
    const { result } = renderHook(() => useOfflinePackPromptTrigger(PARIS_CITY));
    await waitFor(() => {
      expect(result.current.visible).toBe(true);
    });
  });

  it('keeps visible=false when the user has already decided for this city', async () => {
    useOfflinePackChoiceStore.setState({
      choices: {
        paris: { decision: 'accepted', recordedAt: new Date().toISOString() },
      },
    });
    const { result } = renderHook(() => useOfflinePackPromptTrigger(PARIS_CITY));
    // Give NetInfo a chance to settle — visibility must NOT flip on.
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.visible).toBe(false);
    expect(mockNetInfoFetch).not.toHaveBeenCalled();
  });

  it('records an accepted choice + clears visibility when accept() is invoked', async () => {
    const { result } = renderHook(() => useOfflinePackPromptTrigger(PARIS_CITY));
    await waitFor(() => {
      expect(result.current.visible).toBe(true);
    });
    act(() => {
      result.current.accept();
    });
    expect(result.current.visible).toBe(false);
    expect(useOfflinePackChoiceStore.getState().choices.paris?.decision).toBe('accepted');
  });

  it('records a declined choice + clears visibility when decline() is invoked', async () => {
    const { result } = renderHook(() => useOfflinePackPromptTrigger(PARIS_CITY));
    await waitFor(() => {
      expect(result.current.visible).toBe(true);
    });
    act(() => {
      result.current.decline();
    });
    expect(result.current.visible).toBe(false);
    expect(useOfflinePackChoiceStore.getState().choices.paris?.decision).toBe('declined');
  });

  it('keeps visible=false on cellular 3G (only wifi or 4G/5G qualify as strong network)', async () => {
    mockNetInfoFetch.mockResolvedValue({
      type: 'cellular',
      isConnected: true,
      details: { cellularGeneration: '3g' },
    });
    const { result } = renderHook(() => useOfflinePackPromptTrigger(PARIS_CITY));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.visible).toBe(false);
  });
});
