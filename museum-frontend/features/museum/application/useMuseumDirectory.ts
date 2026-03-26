import { useCallback, useEffect, useMemo, useState } from 'react';

import type { MuseumDirectoryEntry } from '../infrastructure/museumApi';
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
 * Hook that fetches the museum directory, enriches entries with distance
 * from the user's location, and supports filtering by name.
 * @param userLatitude - Current user latitude (null if unavailable).
 * @param userLongitude - Current user longitude (null if unavailable).
 */
export const useMuseumDirectory = (
  userLatitude: number | null,
  userLongitude: number | null,
): UseMuseumDirectoryResult => {
  const [rawMuseums, setRawMuseums] = useState<MuseumDirectoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchMuseums = useCallback(async () => {
    setIsLoading(true);
    try {
      const museums = await museumApi.listMuseumDirectory();
      setRawMuseums(museums);
    } catch {
      setRawMuseums([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMuseums();
  }, [fetchMuseums]);

  const enriched = useMemo<MuseumWithDistance[]>(() => {
    return rawMuseums.map((museum) => {
      let distance: number | null = null;

      if (
        userLatitude !== null &&
        userLongitude !== null &&
        museum.latitude !== null &&
        museum.longitude !== null
      ) {
        distance = haversineDistance(
          userLatitude,
          userLongitude,
          museum.latitude,
          museum.longitude,
        );
        distance = Math.round(distance * 10) / 10;
      }

      return { ...museum, distance };
    });
  }, [rawMuseums, userLatitude, userLongitude]);

  const museums = useMemo<MuseumWithDistance[]>(() => {
    let filtered = enriched;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = enriched.filter(
        (m) =>
          m.name.toLowerCase().includes(query) ||
    // eslint-disable-next-line @typescript-eslint/prefer-optional-chain -- complex condition
          (m.address && m.address.toLowerCase().includes(query)),
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
  }, [enriched, searchQuery]);

  const refresh = useCallback(() => {
    void fetchMuseums();
  }, [fetchMuseums]);

  return { museums, isLoading, searchQuery, setSearchQuery, refresh };
};
