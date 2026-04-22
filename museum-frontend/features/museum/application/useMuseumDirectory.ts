import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { MuseumDirectoryEntry } from '../infrastructure/museumApi';
import type { MuseumSearchEntry } from '../infrastructure/museumApi';
import { museumApi } from '../infrastructure/museumApi';
import { haversineDistanceMeters } from './haversine';

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

/** GPS jitter suppression threshold: ignore coordinate changes smaller than this. */
const MIN_COORD_CHANGE_METERS = 500;

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

/**
 * Hook that fetches the museum directory, enriches entries with distance
 * from the user's location, and supports filtering by name.
 *
 * When geolocation is available, uses the backend search endpoint for
 * server-side geo-sorted results. Falls back to the directory endpoint
 * with client-side distance enrichment when location is unavailable or
 * the search endpoint fails.
 *
 * @param userLatitude - Current user latitude (null if unavailable).
 * @param userLongitude - Current user longitude (null if unavailable).
 */
export const useMuseumDirectory = (
  userLatitude: number | null,
  userLongitude: number | null,
): UseMuseumDirectoryResult => {
  const [rawMuseums, setRawMuseums] = useState<MuseumWithDistance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Debounced search query — triggers API call when user types >=2 chars.
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Track last fetched coordinates to avoid re-fetching for tiny GPS fluctuations.
  const lastFetchCoordsRef = useRef<{ lat: number; lng: number } | null>(null);

  // Marks whether the geo-aware search endpoint has already produced a result.
  // Once true, losing GPS (or the user zooming out to a region with no coords) must NOT
  // trigger a full-France directory reload — we keep the already-loaded local results.
  const hasServerFetchedRef = useRef(false);

  /** Fallback: fetch all museums from the directory endpoint and enrich client-side. */
  const fetchFromDirectory = useCallback(async (lat: number | null, lng: number | null) => {
    const entries = await museumApi.listMuseumDirectory();
    return entries.map<MuseumWithDistance>((museum) => {
      let distanceMeters: number | null = null;

      if (lat !== null && lng !== null && museum.latitude != null && museum.longitude != null) {
        distanceMeters = Math.round(
          haversineDistanceMeters(lat, lng, museum.latitude, museum.longitude),
        );
      }

      return { ...museum, distanceMeters, source: 'local' as const };
    });
  }, []);

  /** Primary: fetch from search endpoint using geo-coordinates and/or text query. */
  const fetchFromSearch = useCallback(
    async (lat: number | null, lng: number | null, q?: string) => {
      const { museums } = await museumApi.searchMuseums({
        ...(lat !== null && lng !== null ? { lat, lng, radius: 3_000 } : {}),
        ...(q ? { q } : {}),
      });
      return museums.map(mapSearchEntryToMuseumWithDistance);
    },
    [],
  );

  const fetchMuseums = useCallback(
    async (lat: number | null, lng: number | null, q?: string) => {
      setIsLoading(true);
      try {
        // Use search endpoint when we have coordinates OR a text query
        if ((lat !== null && lng !== null) || q) {
          try {
            const results = await fetchFromSearch(lat, lng, q);
            setRawMuseums(results);
            hasServerFetchedRef.current = true;
            return;
          } catch {
            // Search endpoint failed — fall back to directory
          }
        }
        const results = await fetchFromDirectory(lat, lng);
        setRawMuseums(results);
      } catch {
        setRawMuseums([]);
      } finally {
        setIsLoading(false);
      }
    },
    [fetchFromSearch, fetchFromDirectory],
  );

  // Fetch museums when coordinates change (initial load, GPS obtained, or map pan).
  // Skips re-fetch if coordinates moved less than MIN_COORD_CHANGE_METERS to ignore GPS jitter.
  useEffect(() => {
    const hasCoords = userLatitude !== null && userLongitude !== null;

    if (hasCoords && lastFetchCoordsRef.current) {
      const dist = haversineDistanceMeters(
        userLatitude,
        userLongitude,
        lastFetchCoordsRef.current.lat,
        lastFetchCoordsRef.current.lng,
      );
      if (dist < MIN_COORD_CHANGE_METERS) return;
    }

    if (hasCoords) {
      lastFetchCoordsRef.current = { lat: userLatitude, lng: userLongitude };
    } else if (hasServerFetchedRef.current) {
      // GPS lost (or never granted post-search) but we already have server-side
      // results: keep them. Refetching the full directory would drop the local
      // geo-scoped list the user is looking at and blow the camera out to France.
      return;
    }

    void fetchMuseums(userLatitude, userLongitude);
  }, [userLatitude, userLongitude, fetchMuseums]);

  // Debounce search query — wait 500ms after last keystroke before API call.
  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    if (searchQuery.trim().length >= 2) {
      debounceTimerRef.current = setTimeout(() => {
        setDebouncedQuery(searchQuery.trim());
      }, 500);
    } else {
      setDebouncedQuery('');
    }

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [searchQuery]);

  // Re-fetch from API when debounced query changes.
  useEffect(() => {
    if (debouncedQuery) {
      void fetchMuseums(userLatitude, userLongitude, debouncedQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only react to debouncedQuery changes
  }, [debouncedQuery]);

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
    void fetchMuseums(userLatitude, userLongitude);
  }, [fetchMuseums, userLatitude, userLongitude]);

  /**
   * Fires the backend search constrained to a map bbox. Bypasses the GPS
   * jitter suppression so the user always gets fresh results when they
   * explicitly ask for "search in this area".
   */
  const searchInBounds = useCallback((bbox: MapBoundingBox) => {
    setIsLoading(true);
    void museumApi
      .searchMuseums({ bbox })
      .then(({ museums: results }) => {
        setRawMuseums(results.map(mapSearchEntryToMuseumWithDistance));
      })
      .catch(() => {
        setRawMuseums([]);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  return { museums, isLoading, searchQuery, setSearchQuery, refresh, searchInBounds };
};
