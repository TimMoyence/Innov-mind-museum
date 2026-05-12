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

// ── useOfflinePacks mock ─────────────────────────────────────────────────────
// The hook composes useOfflinePacks for the download lifecycle. We expose a
// controllable `mockDownload` + a mutable `mockPacksByCity` so each test can
// drive the state machine (idle → active → complete | error).
const mockDownload = jest.fn();
let mockPacksByCity: Record<string, unknown> = {};
jest.mock('@/features/museum/application/useOfflinePacks', () => ({
  useOfflinePacks: () => ({
    packsByCity: mockPacksByCity,
    isLoading: false,
    refresh: jest.fn(),
    download: mockDownload,
    remove: jest.fn(),
  }),
}));

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
    mockPacksByCity = {};
    mockDownload.mockResolvedValue(undefined);
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
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.visible).toBe(false);
    expect(mockNetInfoFetch).not.toHaveBeenCalled();
  });

  it('accept() records choice + triggers download(city) with full City object (R1)', async () => {
    const { result } = renderHook(() => useOfflinePackPromptTrigger(PARIS_CITY));
    await waitFor(() => {
      expect(result.current.visible).toBe(true);
    });
    act(() => {
      result.current.accept();
    });
    expect(useOfflinePackChoiceStore.getState().choices.paris?.decision).toBe('accepted');
    expect(mockDownload).toHaveBeenCalledTimes(1);
    const arg = mockDownload.mock.calls[0]?.[0] as { id: string; bounds: number[] };
    expect(arg.id).toBe('paris');
    expect(arg.bounds).toHaveLength(4);
    expect(arg.bounds.every((n) => typeof n === 'number')).toBe(true);
  });

  it('accept() with null nearestCity is a no-op (R8)', () => {
    const { result } = renderHook(() => useOfflinePackPromptTrigger(null));
    act(() => {
      result.current.accept();
    });
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('accept() while packState is already active is a no-op (race guard)', async () => {
    mockPacksByCity = { paris: { status: 'active', percentage: 30, bytesOnDisk: 1000 } };
    const { result } = renderHook(() => useOfflinePackPromptTrigger(PARIS_CITY));
    await waitFor(() => {
      expect(result.current.visible).toBe(true);
    });
    act(() => {
      result.current.accept();
    });
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('download rejection → errorVisible flips to true (R4)', async () => {
    mockDownload.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useOfflinePackPromptTrigger(PARIS_CITY));
    await waitFor(() => {
      expect(result.current.visible).toBe(true);
    });
    await act(async () => {
      result.current.accept();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.errorVisible).toBe(true);
  });

  it('retry() clears errorVisible + re-calls download', async () => {
    mockDownload.mockRejectedValueOnce(new Error('first')).mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useOfflinePackPromptTrigger(PARIS_CITY));
    await waitFor(() => {
      expect(result.current.visible).toBe(true);
    });
    await act(async () => {
      result.current.accept();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.errorVisible).toBe(true);
    await act(async () => {
      result.current.retry();
      await Promise.resolve();
    });
    expect(result.current.errorVisible).toBe(false);
    expect(mockDownload).toHaveBeenCalledTimes(2);
  });

  it('decline() records declined + hides modal (R7)', async () => {
    const { result } = renderHook(() => useOfflinePackPromptTrigger(PARIS_CITY));
    await waitFor(() => {
      expect(result.current.visible).toBe(true);
    });
    act(() => {
      result.current.decline();
    });
    expect(result.current.visible).toBe(false);
    expect(useOfflinePackChoiceStore.getState().choices.paris?.decision).toBe('declined');
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('dismiss() hides modal + clears errorVisible', async () => {
    mockDownload.mockRejectedValueOnce(new Error('x'));
    const { result } = renderHook(() => useOfflinePackPromptTrigger(PARIS_CITY));
    await waitFor(() => {
      expect(result.current.visible).toBe(true);
    });
    await act(async () => {
      result.current.accept();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.errorVisible).toBe(true);
    act(() => {
      result.current.dismiss();
    });
    expect(result.current.visible).toBe(false);
    expect(result.current.errorVisible).toBe(false);
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
