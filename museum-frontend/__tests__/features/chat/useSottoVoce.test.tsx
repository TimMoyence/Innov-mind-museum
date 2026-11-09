import { act, renderHook, waitFor } from '@testing-library/react-native';

import '../../helpers/test-utils';

const mockGetItem = jest.fn<Promise<string | null>, [string]>();
const mockSetItem = jest.fn<Promise<void>, [string, string]>();

jest.mock('@/shared/infrastructure/storage', () => ({
  storage: {
    getItem: (key: string) => mockGetItem(key),
    setItem: (key: string, value: string) => mockSetItem(key, value),
    removeItem: jest.fn(),
    getJSON: jest.fn(),
    setJSON: jest.fn(),
  },
}));

import { useSottoVoce, SOTTO_VOCE_STORAGE_KEY } from '@/features/chat/application/useSottoVoce';

describe('useSottoVoce (B5 hook — silent-room toggle, AsyncStorage persistence)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
  });

  describe('storage key contract (R8, AC1)', () => {
    it('exposes SOTTO_VOCE_STORAGE_KEY === "settings.sotto_voce_mode"', () => {
      expect(SOTTO_VOCE_STORAGE_KEY).toBe('settings.sotto_voce_mode');
    });
  });

  describe('initial state + hydration (R3, AC2-AC4)', () => {
    it('returns the documented shape { enabled, isLoading, toggle }', async () => {
      mockGetItem.mockResolvedValue(null);
      const { result } = renderHook(() => useSottoVoce());

      expect(typeof result.current.enabled).toBe('boolean');
      expect(typeof result.current.isLoading).toBe('boolean');
      expect(typeof result.current.toggle).toBe('function');

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('starts with enabled=false and isLoading=true before AsyncStorage settles', () => {
      mockGetItem.mockReturnValue(new Promise(() => undefined));
      const { result } = renderHook(() => useSottoVoce());
      expect(result.current.enabled).toBe(false);
      expect(result.current.isLoading).toBe(true);
    });

    it('hydrates enabled=true when AsyncStorage holds the string "true" (R3, AC3)', async () => {
      mockGetItem.mockResolvedValue('true');
      const { result } = renderHook(() => useSottoVoce());
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.enabled).toBe(true);
      expect(mockGetItem).toHaveBeenCalledWith('settings.sotto_voce_mode');
    });

    it('hydrates enabled=false when AsyncStorage holds the string "false" (R3, AC4)', async () => {
      mockGetItem.mockResolvedValue('false');
      const { result } = renderHook(() => useSottoVoce());
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.enabled).toBe(false);
    });

    it('hydrates enabled=false when AsyncStorage holds null (key absent — first launch)', async () => {
      mockGetItem.mockResolvedValue(null);
      const { result } = renderHook(() => useSottoVoce());
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.enabled).toBe(false);
    });

    it('only treats the literal string "true" as enabled (defensive parsing)', async () => {
      mockGetItem.mockResolvedValue('TRUE');
      const { result } = renderHook(() => useSottoVoce());
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.enabled).toBe(false);
    });
  });

  describe('toggle() optimistic flip + persistence (R4, AC5)', () => {
    it('flips enabled false → true and writes "true" to AsyncStorage', async () => {
      mockGetItem.mockResolvedValue(null);
      const { result } = renderHook(() => useSottoVoce());
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.enabled).toBe(false);

      await act(async () => {
        await result.current.toggle();
      });

      expect(result.current.enabled).toBe(true);
      expect(mockSetItem).toHaveBeenCalledWith('settings.sotto_voce_mode', 'true');
    });

    it('flips enabled true → false and writes "false" to AsyncStorage', async () => {
      mockGetItem.mockResolvedValue('true');
      const { result } = renderHook(() => useSottoVoce());
      await waitFor(() => {
        expect(result.current.enabled).toBe(true);
      });

      await act(async () => {
        await result.current.toggle();
      });

      expect(result.current.enabled).toBe(false);
      expect(mockSetItem).toHaveBeenCalledWith('settings.sotto_voce_mode', 'false');
    });

    it('updates enabled optimistically (visible immediately after toggle)', async () => {
      mockGetItem.mockResolvedValue(null);
      mockSetItem.mockReturnValue(new Promise(() => undefined));
      const { result } = renderHook(() => useSottoVoce());
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        void result.current.toggle();
      });

      expect(result.current.enabled).toBe(true);
    });
  });

  describe('read failure tolerance (R6, AC6)', () => {
    it('does NOT throw when AsyncStorage read rejects', () => {
      mockGetItem.mockRejectedValue(new Error('AsyncStorage unavailable'));
      expect(() => renderHook(() => useSottoVoce())).not.toThrow();
    });

    it('falls back to enabled=false + isLoading=false when AsyncStorage read rejects', async () => {
      mockGetItem.mockRejectedValue(new Error('AsyncStorage unavailable'));
      const { result } = renderHook(() => useSottoVoce());
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.enabled).toBe(false);
    });

    it('allows the user to toggle even after a read failure (best-effort write)', async () => {
      mockGetItem.mockRejectedValue(new Error('AsyncStorage unavailable'));
      const { result } = renderHook(() => useSottoVoce());
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.toggle();
      });

      expect(result.current.enabled).toBe(true);
      expect(mockSetItem).toHaveBeenCalledWith('settings.sotto_voce_mode', 'true');
    });
  });

  describe('storage façade only (R5, no new dep)', () => {
    it('never bypasses the storage façade — only mockGetItem / mockSetItem are touched', async () => {
      mockGetItem.mockResolvedValue(null);
      const { result } = renderHook(() => useSottoVoce());
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      await act(async () => {
        await result.current.toggle();
      });
      expect(mockGetItem).toHaveBeenCalledTimes(1);
      expect(mockSetItem).toHaveBeenCalledTimes(1);
    });
  });
});
