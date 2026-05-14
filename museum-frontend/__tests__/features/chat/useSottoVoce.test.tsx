/**
 * Red tests for B5 — `useSottoVoce` hook (silent-room toggle + AsyncStorage
 * persistence, mirror of `useAudioDescriptionMode`).
 *
 * Asserts the contract documented in `docs/chat-ux-refonte/specs/B5.md` :
 *
 *   §1.1 (R1-R8) — hook shape + persistence + read-failure tolerance.
 *   §4 (AC1-AC6) — storage key + state machine + reject path.
 *
 * Key invariants :
 *   - `SOTTO_VOCE_STORAGE_KEY === 'settings.sotto_voce_mode'`.
 *   - First mount : `enabled = false`, `isLoading = true` → resolves to the
 *     stored value (only `'true'` truthy) and `isLoading = false`.
 *   - `toggle()` flips optimistically + writes via the `storage` façade.
 *   - Storage read reject → hook falls back to `enabled = false`, no throw.
 *
 * At baseline (B5 not yet implemented) :
 *   - `@/features/chat/application/useSottoVoce` does not exist.
 *     → Jest fails with "Cannot find module" at module load time.
 */

import { act, renderHook, waitFor } from '@testing-library/react-native';

import '../../helpers/test-utils';

// ── storage façade mock — drives the hook deterministically ─────────────────
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

// RED ASSERTION 1 : module does not exist yet at baseline.
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

      // Shape check before hydrat resolves — keys must exist immediately.
      expect(typeof result.current.enabled).toBe('boolean');
      expect(typeof result.current.isLoading).toBe('boolean');
      expect(typeof result.current.toggle).toBe('function');

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('starts with enabled=false and isLoading=true before AsyncStorage settles', () => {
      // Don't resolve the promise yet — observe the synchronous initial state.
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
      // String comparison is strict — 'TRUE' must NOT be treated as truthy.
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
      // Make the write never resolve — but enabled must still flip.
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
      // The façade is the ONLY persistence boundary the hook is allowed to use.
      // If a future regression directly imports AsyncStorage (or `expo-secure-store`),
      // this assertion will not catch it directly — but the snapshot of calls
      // documents the contract: 1 read at mount, 1 write at toggle.
      expect(mockGetItem).toHaveBeenCalledTimes(1);
      expect(mockSetItem).toHaveBeenCalledTimes(1);
    });
  });
});
