import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { MuseumDirectoryEntry } from '../infrastructure/museumApi';
import type { MuseumSearchEntry } from '../infrastructure/museumApi';
import { museumApi } from '../infrastructure/museumApi';
import { haversineDistance } from './haversine';

/** Museum entry enriched with optional distance from the user. */
export interface MuseumWithDistance extends MuseumDirectoryEntry {
  distance: number | null;
}

interface UseMuseumDirectoryResult {
  museums: MuseumWithDistance[];
  isLoading: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  refresh: () => void;
}

/**
 * Maps a search result entry to the MuseumWithDistance shape expected by the UI.
 * OSM results lack id/slug/description — synthetic values are used.
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
  distance: Math.round(entry.distance * 10) / 10,
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

  /** Fallback: fetch all museums from the directory endpoint and enrich client-side. */
  const fetchFromDirectory = useCallback(async (lat: number | null, lng: number | null) => {
    const entries = await museumApi.listMuseumDirectory();
    return entries.map<MuseumWithDistance>((museum) => {
      let distance: number | null = null;

      if (lat !== null && lng !== null && museum.latitude !== null && museum.longitude !== null) {
        distance = haversineDistance(lat, lng, museum.latitude, museum.longitude);
        distance = Math.round(distance * 10) / 10;
      }

      return { ...museum, distance };
    });
  }, []);

  /** Primary: fetch from search endpoint using geo-coordinates and/or text query. */
  const fetchFromSearch = useCallback(
    async (lat: number | null, lng: number | null, q?: string) => {
      const { museums } = await museumApi.searchMuseums({
        ...(lat !== null && lng !== null ? { lat, lng, radius: 30_000 } : {}),
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
  // Skips re-fetch if coordinates moved less than ~500 m to ignore GPS jitter.
  useEffect(() => {
    const hasCoords = userLatitude !== null && userLongitude !== null;

    if (hasCoords && lastFetchCoordsRef.current) {
      const dist = haversineDistance(
        userLatitude,
        userLongitude,
        lastFetchCoordsRef.current.lat,
        lastFetchCoordsRef.current.lng,
      );
      if (dist < 0.5) return; // < 500 m — skip
    }

    if (hasCoords) {
      lastFetchCoordsRef.current = { lat: userLatitude, lng: userLongitude };
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
      if (a.distance !== null && b.distance !== null) {
        return a.distance - b.distance;
      }
      if (a.distance !== null) return -1;
      if (b.distance !== null) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [rawMuseums, searchQuery]);

  const refresh = useCallback(() => {
    void fetchMuseums(userLatitude, userLongitude);
  }, [fetchMuseums, userLatitude, userLongitude]);

  return { museums, isLoading, searchQuery, setSearchQuery, refresh };
};
