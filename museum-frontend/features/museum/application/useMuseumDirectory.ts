import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData } from '@tanstack/react-query';

import { useAppQuery } from '@/shared/data/useAppQuery';

import type { MuseumDirectoryEntry } from '../infrastructure/museumApi';
import type { MuseumSearchEntry } from '../infrastructure/museumApi';
import { museumApi } from '../infrastructure/museumApi';

export type { MuseumCategory } from '../infrastructure/museumApi';

/**
 * Museum entry enriched with optional distance from the user.
 *
 * `distanceMeters` is always expressed in meters — matching the backend
 * `searchMuseums` contract. UI components must format it via `formatDistance()`;
 * never assume a unit from the raw number.
 */
export interface MuseumWithDistance extends MuseumDirectoryEntry {
  distanceMeters: number | null;
  source: 'local' | 'osm';
}

/** Bounding box ordered as [minLng, minLat, maxLng, maxLat] (WGS84). */
export type MapBoundingBox = [number, number, number, number];

interface UseMuseumDirectoryResult {
  museums: MuseumWithDistance[];
  isLoading: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  refresh: () => void;
  /** Re-fetches museums constrained to a visible map bounding box. */
  searchInBounds: (bbox: MapBoundingBox) => void;
}

const DEFAULT_RADIUS_METERS = 3_000;
const STALE_TIME_MS = 5 * 60_000;
const GC_TIME_MS = 30 * 60_000;
const SEARCH_DEBOUNCE_MS = 500;
const MIN_SEARCH_CHARS = 2;
/** GPS-jitter dedup resolution: 2 decimals ≈ 1.1 km at the equator. */
const COORD_KEY_PRECISION = 100;

const roundCoord = (value: number | null): number | null =>
  value === null ? null : Math.round(value * COORD_KEY_PRECISION) / COORD_KEY_PRECISION;

/**
 * Maps a search result entry to the MuseumWithDistance shape expected by the UI.
 * OSM results lack id/slug/description — synthetic values are used.
 *
 * Backend `searchMuseums` returns `distance` in meters; we preserve the unit
 * and only round to the nearest meter for a stable display value.
 */
const mapSearchEntryToMuseumWithDistance = (
  entry: MuseumSearchEntry,
  index: number,
): MuseumWithDistance => ({
  id: -(index + 1),
  name: entry.name,
  slug: '',
  address: entry.address,
  description: null,
  latitude: entry.latitude,
  longitude: entry.longitude,
  distanceMeters: Math.round(entry.distance),
  source: entry.source,
  museumType: entry.museumType,
});

const mapDirectoryEntryToMuseumWithDistance = (
  museum: MuseumDirectoryEntry,
): MuseumWithDistance => ({
  ...museum,
  distanceMeters: null,
  source: 'local' as const,
});

/**
 * Hook that fetches the museum directory, enriches entries with distance
 * from the user's location, and supports filtering by name.
 *
 * When geolocation is available, uses the backend search endpoint for
 * server-side geo-sorted results. Falls back to the directory endpoint
 * with client-side distance enrichment when location is unavailable or
 * the search endpoint fails.
 *
 * Cache strategy (react-query):
 * - `['museums','near', roundedLat, roundedLng]` when coords available —
 *   rounded to 2 decimals (~1.1 km) to dedup GPS jitter into the same key.
 * - `['museums','directory']` when no coords.
 * - `['museums','search', q]` for text searches (>= 2 chars, 500 ms debounce).
 * - Bbox searches bypass the cache via `bboxResults` local state — the bbox
 *   itself is ephemeral ("search in this map area") and would otherwise
 *   explode the cache key space.
 *
 * @param userLatitude - Current user latitude (null if unavailable).
 * @param userLongitude - Current user longitude (null if unavailable).
 */
export const useMuseumDirectory = (
  userLatitude: number | null,
  userLongitude: number | null,
): UseMuseumDirectoryResult => {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [bboxResults, setBboxResults] = useState<MuseumWithDistance[] | null>(null);
  const [isBboxLoading, setIsBboxLoading] = useState(false);

  const hasCoords = userLatitude !== null && userLongitude !== null;
  const roundedLat = roundCoord(userLatitude);
  const roundedLng = roundCoord(userLongitude);

  const nearQueryKey = useMemo(() => {
    if (hasCoords) {
      return ['museums', 'near', roundedLat, roundedLng] as const;
    }
    return ['museums', 'directory'] as const;
  }, [hasCoords, roundedLat, roundedLng]);

  const museumsQuery = useAppQuery<MuseumWithDistance[]>({
    queryKey: nearQueryKey,
    queryFn: async () => {
      // Geo path: prefer search endpoint, fall back to directory if search
      // errors (keeps the UX working when the search service is degraded).
      if (userLatitude !== null && userLongitude !== null) {
        try {
          const { museums } = await museumApi.searchMuseums({
            lat: userLatitude,
            lng: userLongitude,
            radius: DEFAULT_RADIUS_METERS,
          });
          return museums.map(mapSearchEntryToMuseumWithDistance);
        } catch {
          const entries = await museumApi.listMuseumDirectory();
          return entries.map(mapDirectoryEntryToMuseumWithDistance);
        }
      }

      const entries = await museumApi.listMuseumDirectory();
      return entries.map(mapDirectoryEntryToMuseumWithDistance);
    },
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Retry policy inherited from the global queryClient's `shouldRetry`,
    // which already gates on AppError kind.
    // When the queryKey flips (GPS acquired/lost, user pans to a new region),
    // keep the previous data on screen while the new fetch resolves instead
    // of flashing an empty list.
    placeholderData: keepPreviousData,
  });

  // Debounce search query — wait 500 ms after last keystroke before API call.
  // The query string below short-circuits on length<MIN via `enabled`, so the
  // effect only needs to PUBLISH a committed value; it never needs to clear it.
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < MIN_SEARCH_CHARS) {
      return undefined;
    }
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedQuery(trimmed);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [searchQuery]);

  // Committed debounced query used by the server-side search — collapses to
  // empty the moment the user backspaces below MIN_SEARCH_CHARS, so a stale
  // `debouncedQuery` from a previous input doesn't keep the search query
  // active.
  const effectiveSearchQuery = searchQuery.trim().length >= MIN_SEARCH_CHARS ? debouncedQuery : '';

  const searchQueryResult = useAppQuery<MuseumWithDistance[]>({
    queryKey: ['museums', 'search', effectiveSearchQuery, roundedLat, roundedLng] as const,
    queryFn: async () => {
      const { museums } = await museumApi.searchMuseums({
        q: effectiveSearchQuery,
        ...(userLatitude !== null && userLongitude !== null
          ? { lat: userLatitude, lng: userLongitude, radius: DEFAULT_RADIUS_METERS }
          : {}),
      });
      return museums.map(mapSearchEntryToMuseumWithDistance);
    },
    enabled: effectiveSearchQuery.length >= MIN_SEARCH_CHARS,
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const rawMuseums: MuseumWithDistance[] = useMemo(() => {
    if (bboxResults !== null) return bboxResults;
    if (effectiveSearchQuery.length >= MIN_SEARCH_CHARS && searchQueryResult.data) {
      return searchQueryResult.data;
    }
    return museumsQuery.data ?? [];
  }, [bboxResults, effectiveSearchQuery, searchQueryResult.data, museumsQuery.data]);

  const museums = useMemo<MuseumWithDistance[]>(() => {
    let filtered = rawMuseums;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = rawMuseums.filter(
        (m) => m.name.toLowerCase().includes(query) || m.address?.toLowerCase().includes(query),
      );
    }

    // Sort by distance if available, otherwise alphabetically
    return [...filtered].sort((a, b) => {
      if (a.distanceMeters !== null && b.distanceMeters !== null) {
        return a.distanceMeters - b.distanceMeters;
      }
      if (a.distanceMeters !== null) return -1;
      if (b.distanceMeters !== null) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [rawMuseums, searchQuery]);

  const refresh = useCallback(() => {
    setBboxResults(null);
    void museumsQuery.refetch();
  }, [museumsQuery]);

  /**
   * Fires the backend search constrained to a map bbox. Stored in local state
   * (not the react-query cache) because bbox is ephemeral per-interaction and
   * caching every pan/zoom rectangle would fragment the cache uselessly.
   */
  const searchInBounds = useCallback((bbox: MapBoundingBox) => {
    setIsBboxLoading(true);
    void museumApi
      .searchMuseums({ bbox })
      .then(({ museums: results }) => {
        setBboxResults(results.map(mapSearchEntryToMuseumWithDistance));
      })
      .catch(() => {
        setBboxResults([]);
      })
      .finally(() => {
        setIsBboxLoading(false);
      });
  }, []);

  const isTextSearchActive = effectiveSearchQuery.length >= MIN_SEARCH_CHARS;
  const isLoading =
    isBboxLoading || (isTextSearchActive ? searchQueryResult.isPending : museumsQuery.isPending);

  return { museums, isLoading, searchQuery, setSearchQuery, refresh, searchInBounds };
};
