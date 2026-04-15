import { geocodeWithNominatim } from '@shared/http/nominatim.client';
import {
  queryOverpassMuseums,
  type MuseumCategory,
  type OverpassMuseumResult,
} from '@shared/http/overpass.client';
import { logger } from '@shared/logger/logger';
import { haversineDistanceMeters } from '@shared/utils/haversine';
import { env } from '@src/config/env';

import type { IMuseumRepository } from '../domain/museum.repository.interface';
import type { CacheService } from '@shared/cache/cache.port';

export type { MuseumCategory } from '@shared/http/overpass.client';

/** Input for the museum search use case. */
export interface SearchMuseumsInput {
  lat?: number;
  lng?: number;
  radiusMeters?: number;
  q?: string;
}

/** A single museum entry in the search results. */
export interface SearchMuseumEntry {
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  distance: number;
  source: 'local' | 'osm';
  museumType: MuseumCategory;
}

/** Search results returned by the use case. */
export interface SearchMuseumsResult {
  museums: SearchMuseumEntry[];
  count: number;
}

const DEFAULT_RADIUS = 30_000;
const MAX_RADIUS = 50_000;
/** Cache empty Overpass results for 5 minutes to avoid hammering a failing API. */
const NEGATIVE_CACHE_TTL_SECONDS = 300;
/** Distance threshold in meters below which an OSM result is considered a duplicate of a local museum. */
const DEDUP_THRESHOLD_METERS = 100;

interface LocalMuseumWithCoords {
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  museumType: MuseumCategory;
}

/** Fetches active local museums from the DB, returning only those with coordinates. */
async function fetchLocalMuseumsWithCoords(
  repository: IMuseumRepository,
): Promise<LocalMuseumWithCoords[]> {
  try {
    const dbMuseums = await repository.findAll({ activeOnly: true });
    const results: LocalMuseumWithCoords[] = [];
    for (const m of dbMuseums) {
      if (m.latitude != null && m.longitude != null) {
        results.push({
          name: m.name,
          address: m.address ?? null,
          latitude: m.latitude,
          longitude: m.longitude,
          museumType: m.museumType,
        });
      }
    }
    return results;
  } catch (error) {
    logger.warn('Failed to fetch local museums for search merge', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/** Merges local and OSM results with proximity-based deduplication. */
function mergeResults(
  lat: number,
  lng: number,
  radius: number,
  localMuseums: LocalMuseumWithCoords[],
  osmResults: OverpassMuseumResult[],
): SearchMuseumEntry[] {
  const entries: SearchMuseumEntry[] = [];

  for (const m of localMuseums) {
    const distance = haversineDistanceMeters(lat, lng, m.latitude, m.longitude);
    if (distance <= radius) {
      entries.push({
        ...m,
        distance: Math.round(distance),
        source: 'local',
        museumType: m.museumType,
      });
    }
  }

  for (const osm of osmResults) {
    const isDuplicate = localMuseums.some(
      (local) =>
        haversineDistanceMeters(local.latitude, local.longitude, osm.latitude, osm.longitude) <
        DEDUP_THRESHOLD_METERS,
    );
    if (!isDuplicate) {
      const distance = haversineDistanceMeters(lat, lng, osm.latitude, osm.longitude);
      entries.push({
        name: osm.name,
        address: osm.address,
        latitude: osm.latitude,
        longitude: osm.longitude,
        distance: Math.round(distance),
        source: 'osm',
        museumType: osm.museumType,
      });
    }
  }

  return entries;
}

/** Searches for museums near a location by merging Overpass API and local DB results. */
export class SearchMuseumsUseCase {
  constructor(
    private readonly repository: IMuseumRepository,
    private readonly cache?: CacheService,
  ) {}

  /** Executes the search, merging OSM and local results with deduplication and distance sorting. */
  async execute(input: SearchMuseumsInput): Promise<SearchMuseumsResult> {
    const { q } = input;
    let { lat, lng } = input;

    // If no coordinates provided, attempt geocoding from text query
    if ((lat == null || lng == null) && q) {
      const geocoded = await geocodeWithNominatim(q);
      if (geocoded) {
        lat = geocoded.lat;
        lng = geocoded.lng;
        logger.info('Geocoded text query to coordinates', { q, lat, lng });
      }
    }

    const localMuseums = await fetchLocalMuseumsWithCoords(this.repository);

    // If we still have no coordinates, return local DB museums only (no Overpass)
    if (lat == null || lng == null) {
      let filtered = localMuseums.map((m) => ({
        ...m,
        distance: 0,
        source: 'local' as const,
        museumType: m.museumType,
      }));

      if (q) {
        const lower = q.toLowerCase();
        filtered = filtered.filter((e) => e.name.toLowerCase().includes(lower));
      }

      return { museums: filtered, count: filtered.length };
    }

    const radius = Math.min(input.radiusMeters ?? DEFAULT_RADIUS, MAX_RADIUS);
    const cacheKey = `osm:museums:${lat.toFixed(2)}:${lng.toFixed(2)}:${String(radius)}`;

    const osmResults = await this.fetchOsmResults(cacheKey, lat, lng, radius);
    const entries = mergeResults(lat, lng, radius, localMuseums, osmResults);

    let filtered = entries;
    if (q) {
      const lower = q.toLowerCase();
      filtered = entries.filter((e) => e.name.toLowerCase().includes(lower));
    }

    filtered.sort((a, b) => a.distance - b.distance);
    return { museums: filtered, count: filtered.length };
  }

  /** Fetches OSM results from cache or Overpass API, caching successful responses. */
  private async fetchOsmResults(
    cacheKey: string,
    lat: number,
    lng: number,
    radius: number,
  ): Promise<OverpassMuseumResult[]> {
    if (this.cache) {
      try {
        const cached = await this.cache.get<OverpassMuseumResult[]>(cacheKey);
        if (cached) return cached;
      } catch {
        // Cache read failure is non-fatal
      }
    }

    const results = await queryOverpassMuseums({ lat, lng, radiusMeters: radius });

    if (this.cache) {
      try {
        const ttl = results.length > 0 ? env.overpassCacheTtlSeconds : NEGATIVE_CACHE_TTL_SECONDS;
        await this.cache.set(cacheKey, results, ttl);
      } catch {
        // Cache write failure is non-fatal
      }
    }

    return results;
  }
}
