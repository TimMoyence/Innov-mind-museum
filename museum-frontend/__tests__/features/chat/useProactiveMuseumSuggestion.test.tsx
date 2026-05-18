/**
 * Tests for `useProactiveMuseumSuggestion` — refactored to consume
 * `museumApi.detectMuseum` (W3 cluster B, R11-R14, R18).
 *
 * Key invariants:
 *   - GPS gate: status !== 'granted' OR null coords → no fetch.
 *   - Calls `museumApi.detectMuseum({ lat, lng })` exactly once per ~111 m tile.
 *   - Returns ProactiveMuseum WHEN confidence > 0.5 AND museumId > 0.
 *   - Returns null when confidence <= 0.5 (boundary).
 *   - Returns null when museumId is null or <= 0.
 *   - Dismiss-until storage gate suppresses the banner for 4 h.
 *   - Tolerates fetch / storage failure silently.
 *
 * Baseline-replacement note: pre-W3 the hook called `searchMuseums` and ran a
 * manual `<200m` filter ; the new flow trusts BE-side confidence model and
 * surfaces ANY confidence > 0.5 (auto-pickup vs confirm-sheet branch picked
 * by the banner).
 */

import { act, renderHook, waitFor } from '@testing-library/react-native';

import '../../helpers/test-utils';

// ── storage façade mock ────────────────────────────────────────────────────
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

// ── useLocation mock ───────────────────────────────────────────────────────
const mockUseLocation = jest.fn();
jest.mock('@/features/museum/application/useLocation', () => ({
  useLocation: () => mockUseLocation(),
}));

// ── museumApi.detectMuseum mock ────────────────────────────────────────────
const mockDetectMuseum = jest.fn<Promise<unknown>, [unknown]>();
jest.mock('@/features/museum/infrastructure/museumApi', () => ({
  museumApi: {
    detectMuseum: (params: unknown) => mockDetectMuseum(params),
  },
}));

import {
  useProactiveMuseumSuggestion,
  PROACTIVE_MUSEUM_BANNER_DISMISS_STORAGE_KEY,
  PROACTIVE_MUSEUM_BANNER_DISMISS_DURATION_MS,
  PROACTIVE_MUSEUM_MIN_CONFIDENCE,
} from '@/features/chat/application/useProactiveMuseumSuggestion';

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

interface DetectionShape {
  museumId: number | null;
  confidence: number;
  distance: number | null;
  name: string | null;
}

function makeDetection(overrides: Partial<DetectionShape> = {}): DetectionShape {
  return {
    museumId: overrides.museumId ?? 7,
    confidence: overrides.confidence ?? 0.9,
    distance: overrides.distance ?? 50,
    name: overrides.name ?? 'Louvre',
  };
}

describe('useProactiveMuseumSuggestion (W3 — detectMuseum consumer)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
    mockUseLocation.mockReturnValue(grantedLocation());
  });

  describe('exported constants', () => {
    it('exposes the dismiss storage key', () => {
      expect(PROACTIVE_MUSEUM_BANNER_DISMISS_STORAGE_KEY).toBe(
        'settings.proactive_museum_banner_dismissed_until',
      );
    });

    it('exposes the 4 h dismiss duration', () => {
      expect(PROACTIVE_MUSEUM_BANNER_DISMISS_DURATION_MS).toBe(14_400_000);
    });

    it('exposes the 0.5 minimum confidence threshold', () => {
      expect(PROACTIVE_MUSEUM_MIN_CONFIDENCE).toBe(0.5);
    });
  });

  describe('shape', () => {
    it('returns { museum, isLoading, dismiss }', async () => {
      mockDetectMuseum.mockResolvedValue(
        makeDetection({ museumId: null, confidence: 0, distance: null, name: null }),
      );
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

  describe('GPS permission gate', () => {
    it('returns museum=null when status !== "granted"', async () => {
      mockUseLocation.mockReturnValue(deniedLocation());
      const { result } = renderHook(() => useProactiveMuseumSuggestion());
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.museum).toBeNull();
      expect(mockDetectMuseum).not.toHaveBeenCalled();
    });

    it('returns museum=null when coords are still null even if granted', async () => {
      mockUseLocation.mockReturnValue(grantedButNoCoords());
      const { result } = renderHook(() => useProactiveMuseumSuggestion());
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.museum).toBeNull();
      expect(mockDetectMuseum).not.toHaveBeenCalled();
    });
  });

  describe('detectMuseum call', () => {
    it('calls museumApi.detectMuseum exactly once with { lat, lng }', async () => {
      mockDetectMuseum.mockResolvedValue(
        makeDetection({ museumId: null, confidence: 0, distance: null, name: null }),
      );
      renderHook(() => useProactiveMuseumSuggestion());
      await waitFor(() => {
        expect(mockDetectMuseum).toHaveBeenCalledTimes(1);
      });
      expect(mockDetectMuseum).toHaveBeenCalledWith({ lat: 48.8606, lng: 2.3376 });
    });
  });

  describe('confidence-driven eligibility', () => {
    it('surfaces the detection when confidence > 0.5 (auto-pickup band)', async () => {
      mockDetectMuseum.mockResolvedValue(
        makeDetection({ museumId: 7, name: 'Louvre', confidence: 1, distance: 0 }),
      );
      const { result } = renderHook(() => useProactiveMuseumSuggestion());
      await waitFor(() => {
        expect(result.current.museum).not.toBeNull();
      });
      expect(result.current.museum).toMatchObject({
        id: 7,
        name: 'Louvre',
        confidence: 1,
        distanceMeters: 0,
      });
    });

    it('surfaces the detection inside the confirm-sheet band (0.5, 0.8]', async () => {
      mockDetectMuseum.mockResolvedValue(
        makeDetection({ museumId: 42, name: "Musée d'Orsay", confidence: 0.6, distance: 200 }),
      );
      const { result } = renderHook(() => useProactiveMuseumSuggestion());
      await waitFor(() => {
        expect(result.current.museum).not.toBeNull();
      });
      expect(result.current.museum?.confidence).toBe(0.6);
      expect(result.current.museum?.id).toBe(42);
    });

    it('returns museum=null when confidence === 0.5 (boundary exclusive)', async () => {
      mockDetectMuseum.mockResolvedValue(
        makeDetection({ museumId: 7, confidence: 0.5, distance: 250 }),
      );
      const { result } = renderHook(() => useProactiveMuseumSuggestion());
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.museum).toBeNull();
    });

    it('returns museum=null when museumId is null', async () => {
      mockDetectMuseum.mockResolvedValue(
        makeDetection({ museumId: null, confidence: 0, distance: null, name: null }),
      );
      const { result } = renderHook(() => useProactiveMuseumSuggestion());
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.museum).toBeNull();
    });

    it('returns museum=null when museumId <= 0 (BE sanity guard)', async () => {
      mockDetectMuseum.mockResolvedValue(makeDetection({ museumId: 0, confidence: 0.9 }));
      const { result } = renderHook(() => useProactiveMuseumSuggestion());
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.museum).toBeNull();
    });
  });

  describe('dismiss-until storage gate', () => {
    it('returns null when storage holds a future ISO', async () => {
      const futureISO = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      mockGetItem.mockImplementation((key) =>
        Promise.resolve(key === PROACTIVE_MUSEUM_BANNER_DISMISS_STORAGE_KEY ? futureISO : null),
      );
      mockDetectMuseum.mockResolvedValue(makeDetection({ confidence: 0.9 }));

      const { result } = renderHook(() => useProactiveMuseumSuggestion());
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.museum).toBeNull();
    });

    it('ignores past dismiss ISOs — banner reappears after 4 h', async () => {
      const pastISO = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      mockGetItem.mockImplementation((key) =>
        Promise.resolve(key === PROACTIVE_MUSEUM_BANNER_DISMISS_STORAGE_KEY ? pastISO : null),
      );
      mockDetectMuseum.mockResolvedValue(
        makeDetection({ museumId: 7, name: 'Louvre', confidence: 0.9, distance: 50 }),
      );

      const { result } = renderHook(() => useProactiveMuseumSuggestion());
      await waitFor(() => {
        expect(result.current.museum?.id).toBe(7);
      });
    });

    it('dismiss() writes (now + 4h).toISOString() under the correct key', async () => {
      mockDetectMuseum.mockResolvedValue(makeDetection({ confidence: 0.9 }));
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

    it('dismiss() clears local museum optimistically', async () => {
      mockDetectMuseum.mockResolvedValue(makeDetection({ confidence: 0.9 }));
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

  describe('error tolerance', () => {
    it('does NOT throw when detectMuseum rejects — museum stays null', async () => {
      mockDetectMuseum.mockRejectedValue(new Error('Network error'));
      const { result } = renderHook(() => useProactiveMuseumSuggestion());
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.museum).toBeNull();
    });

    it('does NOT throw when storage.getItem rejects — proceeds as if not dismissed', async () => {
      mockGetItem.mockRejectedValue(new Error('Storage unavailable'));
      mockDetectMuseum.mockResolvedValue(
        makeDetection({ museumId: 7, confidence: 0.9, distance: 50 }),
      );

      const { result } = renderHook(() => useProactiveMuseumSuggestion());
      await waitFor(() => {
        expect(result.current.museum?.id).toBe(7);
      });
    });
  });
});
