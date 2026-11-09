import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData } from '@tanstack/react-query';

import { useAppQuery } from '@/shared/data/useAppQuery';

import type { MuseumDirectoryEntry } from '../infrastructure/museumApi';
import type { MuseumSearchEntry } from '../infrastructure/museumApi';
import { museumApi } from '../infrastructure/museumApi';

export type { MuseumCategory } from '../infrastructure/museumApi';

export interface MuseumWithDistance extends MuseumDirectoryEntry {
  distanceMeters: number | null;
  source: 'local' | 'osm';
}

export type MapBoundingBox = [number, number, number, number];

interface UseMuseumDirectoryResult {
  museums: MuseumWithDistance[];
  isLoading: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  refresh: () => void;
  searchInBounds: (bbox: MapBoundingBox) => void;
}

const DEFAULT_RADIUS_METERS = 3_000;
const STALE_TIME_MS = 5 * 60_000;
const GC_TIME_MS = 30 * 60_000;
const SEARCH_DEBOUNCE_MS = 500;
const MIN_SEARCH_CHARS = 2;
const COORD_KEY_PRECISION = 100;

const roundCoord = (value: number | null): number | null =>
  value === null ? null : Math.round(value * COORD_KEY_PRECISION) / COORD_KEY_PRECISION;

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
    queryFn: async ({ signal }) => {
      if (userLatitude !== null && userLongitude !== null) {
        try {
          const { museums } = await museumApi.searchMuseums(
            {
              lat: userLatitude,
              lng: userLongitude,
              radius: DEFAULT_RADIUS_METERS,
            },
            { signal },
          );
          return museums.map(mapSearchEntryToMuseumWithDistance);
        } catch {
          const entries = await museumApi.listMuseumDirectory({ signal });
          return entries.map(mapDirectoryEntryToMuseumWithDistance);
        }
      }

      const entries = await museumApi.listMuseumDirectory({ signal });
      return entries.map(mapDirectoryEntryToMuseumWithDistance);
    },
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    placeholderData: keepPreviousData,
  });

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

  const effectiveSearchQuery = searchQuery.trim().length >= MIN_SEARCH_CHARS ? debouncedQuery : '';

  const searchQueryResult = useAppQuery<MuseumWithDistance[]>({
    queryKey: ['museums', 'search', effectiveSearchQuery, roundedLat, roundedLng] as const,
    queryFn: async ({ signal }) => {
      const { museums } = await museumApi.searchMuseums(
        {
          q: effectiveSearchQuery,
          ...(userLatitude !== null && userLongitude !== null
            ? { lat: userLatitude, lng: userLongitude, radius: DEFAULT_RADIUS_METERS }
            : {}),
        },
        { signal },
      );
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
