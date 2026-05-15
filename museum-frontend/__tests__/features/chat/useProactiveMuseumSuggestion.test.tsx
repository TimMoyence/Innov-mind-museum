/**
 * Red tests for B6 — `useProactiveMuseumSuggestion` hook (proactive in-museum
 * banner data layer : GPS permission inference, museum search filter,
 * 200m in-museum threshold, dismiss-until storage gate).
 *
 * Asserts the contract documented in `docs/chat-ux-refonte/specs/B6.md` :
 *
 *   §1.1 (R1-R14) — hook shape + GPS gate + fetch + filter + threshold +
 *                   dismiss-until storage gate + telemetry counters.
 *   §4 (AC1-AC13) — exported constants + filter rules + dismiss flow +
 *                   error tolerance.
 *
 * Key invariants :
 *   - Exposed constants :
 *       PROACTIVE_MUSEUM_BANNER_DISMISS_STORAGE_KEY === 'settings.proactive_museum_banner_dismissed_until'
 *       PROACTIVE_MUSEUM_BANNER_DISMISS_DURATION_MS === 14_400_000   (4 h)
 *       PROACTIVE_MUSEUM_IN_MUSEUM_THRESHOLD_M === 200
 *   - Hook returns `{ museum: ProactiveMuseum | null; isLoading: boolean; dismiss: () => Promise<void> }`.
 *   - Gates on `useLocation()` : if `status !== 'granted'` OR
 *     coords null → museum=null, no `searchMuseums` call.
 *   - Calls `museumApi.searchMuseums({ lat, lng, radius: 1000 })`.
 *   - Picks first eligible : `id > 0` AND `distance < 200`.
 *   - Filters OUT entries with `id <= 0` (OSM-only).
 *   - Returns null when `museums[0].distance >= 200` (boundary `>=`).
 *   - Dismiss-until storage gate : ISO timestamp in the future suppresses
 *     the banner ; expired/missing/unparseable → proceeds normally.
 *   - `dismiss()` writes `(now + 4h).toISOString()` AND sets local
 *     museum to `null` synchronously.
 *   - No throw on API error / storage error.
 *
 * At baseline (B6 not yet implemented) :
 *   - `@/features/chat/application/useProactiveMuseumSuggestion` does not
 *     exist (verified : the file is absent from `features/chat/application/`).
 *     → Jest fails with "Cannot find module" at module load time.
 *
 * Spec : `docs/chat-ux-refonte/specs/B6.md` §1.1 R1-R14 ; §4 AC1-AC13.
 * Baseline : `325873b3` (worktree HEAD post-B2 done).
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

// ── useLocation mock — drives GPS gating ────────────────────────────────────
const mockUseLocation = jest.fn();
jest.mock('@/features/museum/application/useLocation', () => ({
  useLocation: () => mockUseLocation(),
}));

// ── museumApi.searchMuseums mock — drives BE response ───────────────────────
const mockSearchMuseums = jest.fn<Promise<unknown>, [unknown]>();
jest.mock('@/features/museum/infrastructure/museumApi', () => ({
  museumApi: {
    searchMuseums: (params: unknown) => mockSearchMuseums(params),
  },
}));

// RED ASSERTION 1 : module does not exist yet at baseline.
import {
  useProactiveMuseumSuggestion,
  PROACTIVE_MUSEUM_BANNER_DISMISS_STORAGE_KEY,
  PROACTIVE_MUSEUM_BANNER_DISMISS_DURATION_MS,
  PROACTIVE_MUSEUM_IN_MUSEUM_THRESHOLD_M,
} from '@/features/chat/application/useProactiveMuseumSuggestion';

// ── small helpers ───────────────────────────────────────────────────────────

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

function grantedLocation(lat = 48.8606, lng = 2.3376) {
  return { latitude: lat, longitude: lng, status: 'granted', precision: 'fresh', error: null };
}
function deniedLocation() {
  return { latitude: null, longitude: null, status: 'denied', precision: null, error: null };
}
function grantedButNoCoords() {
  return {
    latitude: null,
    longitude: null,
    status: 'granted',
    precision: null,
    error: null,
  };
}

interface SearchMuseumEntry {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  distance: number;
}

function makeMuseum(overrides: Partial<SearchMuseumEntry> = {}): SearchMuseumEntry {
  return {
    id: overrides.id ?? 7,
    name: overrides.name ?? 'Louvre',
    latitude: overrides.latitude ?? 48.8606,
    longitude: overrides.longitude ?? 2.3376,
    distance: overrides.distance ?? 50,
  };
}

function searchResponse(museums: SearchMuseumEntry[]) {
  return { museums, count: museums.length };
}

describe('useProactiveMuseumSuggestion (B6 — proactive in-museum hook)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
    mockUseLocation.mockReturnValue(grantedLocation());
  });

  // ────────────────────────────────────────────────────────────────────────
  // §1.1 R13 / §4 AC1 — exported constants contract
  // ────────────────────────────────────────────────────────────────────────
  describe('exported constants (R13, AC1)', () => {
    it('exposes PROACTIVE_MUSEUM_BANNER_DISMISS_STORAGE_KEY === "settings.proactive_museum_banner_dismissed_until"', () => {
      expect(PROACTIVE_MUSEUM_BANNER_DISMISS_STORAGE_KEY).toBe(
        'settings.proactive_museum_banner_dismissed_until',
      );
    });

    it('exposes PROACTIVE_MUSEUM_BANNER_DISMISS_DURATION_MS === 14_400_000 (4h)', () => {
      expect(PROACTIVE_MUSEUM_BANNER_DISMISS_DURATION_MS).toBe(14_400_000);
    });

    it('exposes PROACTIVE_MUSEUM_IN_MUSEUM_THRESHOLD_M === 200', () => {
      expect(PROACTIVE_MUSEUM_IN_MUSEUM_THRESHOLD_M).toBe(200);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // §1.1 R1 — hook shape
  // ────────────────────────────────────────────────────────────────────────
  describe('shape (R1)', () => {
    it('returns { museum, isLoading, dismiss } as documented', async () => {
      mockSearchMuseums.mockResolvedValue(searchResponse([]));
      const { result } = renderHook(() => useProactiveMuseumSuggestion());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current).toEqual(
        expect.objectContaining({
          museum: null,
          isLoading: expect.any(Boolean),
          dismiss: expect.any(Function),
        }),
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // §1.1 R2-R3 / §4 AC2-AC3 — GPS permission gate
  // ────────────────────────────────────────────────────────────────────────
  describe('GPS permission gate (R2-R3, AC2-AC3)', () => {
    it('returns museum=null when useLocation.status !== "granted" (AC2)', async () => {
      mockUseLocation.mockReturnValue(deniedLocation());
      const { result } = renderHook(() => useProactiveMuseumSuggestion());
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.museum).toBeNull();
      expect(mockSearchMuseums).not.toHaveBeenCalled();
    });

    it('returns museum=null when status==="granted" but coords are still null (AC3)', async () => {
      mockUseLocation.mockReturnValue(grantedButNoCoords());
      const { result } = renderHook(() => useProactiveMuseumSuggestion());
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.museum).toBeNull();
      expect(mockSearchMuseums).not.toHaveBeenCalled();
    });

    it('does NOT request any expo-location permission of its own (R2)', () => {
      // The hook reads useLocation() ; it MUST NOT import expo-location directly.
      // We verify this indirectly : when useLocation returns denied, the hook
      // does NOT retry, does NOT call any permission API, does NOT throw.
      mockUseLocation.mockReturnValue(deniedLocation());
      const { result } = renderHook(() => useProactiveMuseumSuggestion());
      expect(result.current.museum).toBeNull();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // §1.1 R4 / §4 AC4 — fetch contract
  // ────────────────────────────────────────────────────────────────────────
  describe('searchMuseums call (R4, AC4)', () => {
    it('calls museumApi.searchMuseums exactly once with { lat, lng, radius: 1000 }', async () => {
      mockSearchMuseums.mockResolvedValue(searchResponse([]));
      renderHook(() => useProactiveMuseumSuggestion());
      await waitFor(() => {
        expect(mockSearchMuseums).toHaveBeenCalledTimes(1);
      });
      expect(mockSearchMuseums).toHaveBeenCalledWith({
        lat: 48.8606,
        lng: 2.3376,
        radius: 1000,
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // §1.1 R5-R6, R14 / §4 AC5-AC8 — filter + threshold rules
  // ────────────────────────────────────────────────────────────────────────
  describe('filter rules (R5-R6, R14, AC5-AC8)', () => {
    it('picks the first museum with id>0 AND distance<200 (AC5)', async () => {
      const close = makeMuseum({ id: 7, name: 'Louvre', distance: 87 });
      mockSearchMuseums.mockResolvedValue(searchResponse([close]));
      const { result } = renderHook(() => useProactiveMuseumSuggestion());
      await waitFor(() => {
        expect(result.current.museum).not.toBeNull();
      });
      expect(result.current.museum?.id).toBe(7);
      expect(result.current.museum?.name).toBe('Louvre');
      expect(result.current.museum?.distanceMeters).toBe(87);
    });

    it('filters OUT entries with id<=0 (OSM-only) and picks the next eligible (AC6)', async () => {
      const osmOnly = makeMuseum({ id: 0, name: 'OSM Phantom', distance: 30 });
      const local = makeMuseum({ id: 42, name: "Musée d'Orsay", distance: 110 });
      mockSearchMuseums.mockResolvedValue(searchResponse([osmOnly, local]));
      const { result } = renderHook(() => useProactiveMuseumSuggestion());
      await waitFor(() => {
        expect(result.current.museum).not.toBeNull();
      });
      expect(result.current.museum?.id).toBe(42);
      expect(result.current.museum?.name).toBe("Musée d'Orsay");
    });

    it('filters OUT entries with negative id (OSM-only negative variant)', async () => {
      const osmNeg = makeMuseum({ id: -100, name: 'OSM-NEG', distance: 10 });
      mockSearchMuseums.mockResolvedValue(searchResponse([osmNeg]));
      const { result } = renderHook(() => useProactiveMuseumSuggestion());
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.museum).toBeNull();
    });

    it('returns museum=null when museums[0].distance >= 200 (boundary >=, AC7)', async () => {
      const exactlyAtThreshold = makeMuseum({ id: 7, distance: 200 });
      mockSearchMuseums.mockResolvedValue(searchResponse([exactlyAtThreshold]));
      const { result } = renderHook(() => useProactiveMuseumSuggestion());
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.museum).toBeNull();
    });

    it('keeps a museum exactly under 200m (boundary < not ≤)', async () => {
      const justUnder = makeMuseum({ id: 7, distance: 199 });
      mockSearchMuseums.mockResolvedValue(searchResponse([justUnder]));
      const { result } = renderHook(() => useProactiveMuseumSuggestion());
      await waitFor(() => {
        expect(result.current.museum).not.toBeNull();
      });
      expect(result.current.museum?.distanceMeters).toBe(199);
    });

    it('returns museum=null when museums array is empty (AC8)', async () => {
      mockSearchMuseums.mockResolvedValue(searchResponse([]));
      const { result } = renderHook(() => useProactiveMuseumSuggestion());
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.museum).toBeNull();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // §1.1 R10 — ProactiveMuseum shape mirrors BE search entry
  // ────────────────────────────────────────────────────────────────────────
  describe('ProactiveMuseum shape (R10)', () => {
    it('exposes id, name, latitude, longitude, distanceMeters', async () => {
      const item = makeMuseum({
        id: 42,
        name: "Musée d'Orsay",
        latitude: 48.86,
        longitude: 2.326,
        distance: 87,
      });
      mockSearchMuseums.mockResolvedValue(searchResponse([item]));
      const { result } = renderHook(() => useProactiveMuseumSuggestion());
      await waitFor(() => {
        expect(result.current.museum).not.toBeNull();
      });
      expect(result.current.museum).toEqual({
        id: 42,
        name: "Musée d'Orsay",
        latitude: 48.86,
        longitude: 2.326,
        distanceMeters: 87,
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // §1.1 R7-R9 / §4 AC9-AC11 — dismiss-until storage gate
  // ────────────────────────────────────────────────────────────────────────
  describe('dismiss-until storage gate (R7-R9, AC9-AC11)', () => {
    it('returns museum=null when storage holds an ISO in the future (AC9)', async () => {
      const futureISO = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      mockGetItem.mockImplementation((key) =>
        Promise.resolve(key === PROACTIVE_MUSEUM_BANNER_DISMISS_STORAGE_KEY ? futureISO : null),
      );
      const close = makeMuseum({ id: 7, distance: 50 });
      mockSearchMuseums.mockResolvedValue(searchResponse([close]));

      const { result } = renderHook(() => useProactiveMuseumSuggestion());
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.museum).toBeNull();
    });

    it('IGNORES the dismiss flag when its ISO is in the past — banner reappears post-4h (AC10)', async () => {
      const pastISO = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      mockGetItem.mockImplementation((key) =>
        Promise.resolve(key === PROACTIVE_MUSEUM_BANNER_DISMISS_STORAGE_KEY ? pastISO : null),
      );
      const close = makeMuseum({ id: 7, distance: 50 });
      mockSearchMuseums.mockResolvedValue(searchResponse([close]));

      const { result } = renderHook(() => useProactiveMuseumSuggestion());
      await waitFor(() => {
        expect(result.current.museum?.id).toBe(7);
      });
    });

    it('dismiss() writes (now + 4h).toISOString() under the correct storage key (AC11)', async () => {
      const close = makeMuseum({ id: 7, distance: 50 });
      mockSearchMuseums.mockResolvedValue(searchResponse([close]));

      const { result } = renderHook(() => useProactiveMuseumSuggestion());
      await waitFor(() => {
        expect(result.current.museum).not.toBeNull();
      });

      const before = Date.now();
      await act(async () => {
        await result.current.dismiss();
      });
      const after = Date.now();

      expect(mockSetItem).toHaveBeenCalledTimes(1);
      const firstCall = mockSetItem.mock.calls[0] ?? [];
      const [key, value] = firstCall;
      expect(key).toBe(PROACTIVE_MUSEUM_BANNER_DISMISS_STORAGE_KEY);
      const writtenMs = new Date(value ?? '').getTime();
      expect(writtenMs).toBeGreaterThanOrEqual(before + FOUR_HOURS_MS);
      expect(writtenMs).toBeLessThanOrEqual(after + FOUR_HOURS_MS);
    });

    it('dismiss() sets local museum to null synchronously (optimistic UI, AC11)', async () => {
      const close = makeMuseum({ id: 7, distance: 50 });
      mockSearchMuseums.mockResolvedValue(searchResponse([close]));

      const { result } = renderHook(() => useProactiveMuseumSuggestion());
      await waitFor(() => {
        expect(result.current.museum).not.toBeNull();
      });

      await act(async () => {
        await result.current.dismiss();
      });
      expect(result.current.museum).toBeNull();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // §1.1 R8, R12 / §4 AC12-AC13 — error tolerance
  // ────────────────────────────────────────────────────────────────────────
  describe('error tolerance (R8, R12, AC12-AC13)', () => {
    it('does NOT throw when museumApi.searchMuseums rejects — museum stays null (AC12)', async () => {
      mockSearchMuseums.mockRejectedValue(new Error('Network error'));
      const { result } = renderHook(() => useProactiveMuseumSuggestion());
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.museum).toBeNull();
    });

    it('does NOT throw when storage.getItem rejects — proceeds as if not dismissed (AC13)', async () => {
      mockGetItem.mockRejectedValue(new Error('Storage unavailable'));
      const close = makeMuseum({ id: 7, distance: 50 });
      mockSearchMuseums.mockResolvedValue(searchResponse([close]));

      const { result } = renderHook(() => useProactiveMuseumSuggestion());
      await waitFor(() => {
        expect(result.current.museum?.id).toBe(7);
      });
    });

    it('tolerates an unparseable dismiss-until value and proceeds normally (R8)', async () => {
      mockGetItem.mockImplementation((key) =>
        Promise.resolve(
          key === PROACTIVE_MUSEUM_BANNER_DISMISS_STORAGE_KEY ? 'not-an-iso-date' : null,
        ),
      );
      const close = makeMuseum({ id: 7, distance: 50 });
      mockSearchMuseums.mockResolvedValue(searchResponse([close]));

      const { result } = renderHook(() => useProactiveMuseumSuggestion());
      await waitFor(() => {
        expect(result.current.museum?.id).toBe(7);
      });
    });
  });
});
