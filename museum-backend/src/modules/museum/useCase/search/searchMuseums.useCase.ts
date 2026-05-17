import { geocodeWithNominatim } from '@shared/http/nominatim.client';
import {
  createCachedOverpassClient,
  queryOverpassMuseums,
  type CachedOverpassSearchFn,
  type MuseumCategory,
  type OverpassMuseumResult,
} from '@shared/http/overpass.client';
import { logger } from '@shared/logger/logger';
import { haversineDistanceMeters } from '@shared/utils/haversine';
import { museumNamesAreSimilar } from '@shared/utils/string-similarity';

import type {
  BoundingBox,
  IMuseumRepository,
} from '@modules/museum/domain/museum/museum.repository.interface';
import type { CacheService } from '@shared/cache/cache.port';

export type { MuseumCategory } from '@shared/http/overpass.client';

/** When both `bbox` and `lat/lng/radiusMeters` are present, `bbox` wins. */
export interface SearchMuseumsInput {
  lat?: number;
  lng?: number;
  radiusMeters?: number;
  q?: string;
  bbox?: BoundingBox;
}

export interface SearchMuseumEntry {
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  distance: number;
  source: 'local' | 'osm';
  museumType: MuseumCategory;
  /** Present only on `source: 'osm'` entries when OSM tag exists. */
  openingHours?: string;
  website?: string;
  phone?: string;
  imageUrl?: string;
  description?: string;
  /** Raw OSM `wheelchair` value: `yes` | `no` | `limited` | `designated`. */
  wheelchair?: string;
}

export interface SearchMuseumsResult {
  museums: SearchMuseumEntry[];
  count: number;
}

const DEFAULT_RADIUS = 30_000;
const MAX_RADIUS = 50_000;
/** Two OSM entries within this distance are always merged (duplicate OSM nodes for the same building). */
const DEDUP_OSM_OSM_METERS = 100;
/** OSM vs local: below this, drop the OSM entry regardless of name. */
const DEDUP_OSM_LOCAL_PURE_METERS = 100;
/** OSM vs local: up to this distance, drop the OSM entry only if names match. */
const DEDUP_OSM_LOCAL_DISTANCE_METERS = 500;

interface LocalMuseumWithCoords {
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  museumType: MuseumCategory;
}

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

/**
 * Collapses OSM-only duplicates via union-find: unions two entries when names
 * match (museumNamesAreSimilar) OR coords ≤ DEDUP_OSM_OSM_METERS. Picks
 * representative = longest address, tiebreak longest name. Deterministic:
 * input order preserved on length ties.
 */
function dedupeOsmResults(osmResults: OverpassMuseumResult[]): OverpassMuseumResult[] {
  const n = osmResults.length;
  if (n <= 1) return [...osmResults];

  const parent: number[] = Array.from({ length: n }, (_, i) => i);

  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    let cur = i;
    while (parent[cur] !== root) {
      const next = parent[cur];
      parent[cur] = root;
      cur = next;
    }
    return root;
  };

  const union = (i: number, j: number): void => {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[rj] = ri;
  };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = osmResults[i];
      const b = osmResults[j];
      const distance = haversineDistanceMeters(a.latitude, a.longitude, b.latitude, b.longitude);
      if (distance <= DEDUP_OSM_OSM_METERS || museumNamesAreSimilar(a.name, b.name)) {
        union(i, j);
      }
    }
  }

  const clusters = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const bucket = clusters.get(root);
    if (bucket) bucket.push(i);
    else clusters.set(root, [i]);
  }

  const picked: OverpassMuseumResult[] = [];
  for (const indices of clusters.values()) {
    let bestIdx = indices[0];
    let bestAddrLen = (osmResults[bestIdx].address ?? '').length;
    let bestNameLen = osmResults[bestIdx].name.length;
    for (let k = 1; k < indices.length; k++) {
      const idx = indices[k];
      const addrLen = (osmResults[idx].address ?? '').length;
      const nameLen = osmResults[idx].name.length;
      if (addrLen > bestAddrLen || (addrLen === bestAddrLen && nameLen > bestNameLen)) {
        bestIdx = idx;
        bestAddrLen = addrLen;
        bestNameLen = nameLen;
      }
    }
    picked.push(osmResults[bestIdx]);
  }

  return picked;
}

/**
 * Duplicate iff coords ≤ DEDUP_OSM_LOCAL_PURE_METERS (name-agnostic), OR
 * coords ≤ DEDUP_OSM_LOCAL_DISTANCE_METERS AND names match.
 */
function osmDuplicatesLocal(
  osm: OverpassMuseumResult,
  locals: readonly LocalMuseumWithCoords[],
): boolean {
  for (const local of locals) {
    const distance = haversineDistanceMeters(
      local.latitude,
      local.longitude,
      osm.latitude,
      osm.longitude,
    );
    if (distance <= DEDUP_OSM_LOCAL_PURE_METERS) return true;
    if (
      distance <= DEDUP_OSM_LOCAL_DISTANCE_METERS &&
      museumNamesAreSimilar(local.name, osm.name)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Merges local + OSM with OSM<->OSM dedup, OSM vs local dedup, and optional
 * radius filter on locals. `radius=null` skips the radius filter (bbox mode).
 */
function mergeAndDedupe(
  centerLat: number,
  centerLng: number,
  radius: number | null,
  locals: readonly LocalMuseumWithCoords[],
  osmResults: readonly OverpassMuseumResult[],
): SearchMuseumEntry[] {
  const entries: SearchMuseumEntry[] = [];

  for (const m of locals) {
    const distance = haversineDistanceMeters(centerLat, centerLng, m.latitude, m.longitude);
    if (radius == null || distance <= radius) {
      entries.push({
        ...m,
        distance: Math.round(distance),
        source: 'local',
        museumType: m.museumType,
      });
    }
  }

  const dedupedOsm = dedupeOsmResults([...osmResults]);
  for (const osm of dedupedOsm) {
    if (osmDuplicatesLocal(osm, locals)) continue;
    const distance = haversineDistanceMeters(centerLat, centerLng, osm.latitude, osm.longitude);
    entries.push({
      name: osm.name,
      address: osm.address,
      latitude: osm.latitude,
      longitude: osm.longitude,
      distance: Math.round(distance),
      source: 'osm',
      museumType: osm.museumType,
      openingHours: osm.openingHours,
      website: osm.website,
      phone: osm.phone,
      imageUrl: osm.imageUrl,
      description: osm.description,
      wheelchair: osm.wheelchair,
    });
  }

  return entries;
}

/**
 * Cache key shapes / TTLs / sentinel wrapping live in
 * `shared/http/overpass.client.ts`. Passing `cache` alone is supported: the
 * factory wires the cached fn for you. `overpassSearch` is primarily for test
 * injection.
 */
export interface SearchMuseumsDeps {
  cache?: CacheService;
  overpassSearch?: CachedOverpassSearchFn;
}

export class SearchMuseumsUseCase {
  private readonly overpassSearch: CachedOverpassSearchFn;

  constructor(
    private readonly repository: IMuseumRepository,
    cacheOrDeps?: CacheService | SearchMuseumsDeps,
  ) {
    const deps: SearchMuseumsDeps = isSearchDeps(cacheOrDeps)
      ? cacheOrDeps
      : { cache: cacheOrDeps };

    if (deps.overpassSearch) {
      this.overpassSearch = deps.overpassSearch;
    } else if (deps.cache) {
      this.overpassSearch = createCachedOverpassClient(deps.cache);
    } else {
      // No cache and no explicit fn — raw live calls. Tests/scripts only;
      // production wiring always passes cache.
      this.overpassSearch = (params) => queryOverpassMuseums(params);
    }
  }

  async execute(input: SearchMuseumsInput): Promise<SearchMuseumsResult> {
    if (input.bbox) {
      return await this.executeBboxSearch(input.bbox, input.q);
    }
    return await this.executeRadiusSearch(input);
  }

  /** Distance measured from the bbox center. */
  private async executeBboxSearch(
    bbox: BoundingBox,
    q: string | undefined,
  ): Promise<SearchMuseumsResult> {
    const [minLng, minLat, maxLng, maxLat] = bbox;
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;

    const localRows = await this.fetchLocalInBbox(bbox);
    const osmResults = await this.overpassSearch({ bbox });

    const localWithCoords: LocalMuseumWithCoords[] = localRows.map((m) => ({
      name: m.name,
      address: m.address ?? null,
      latitude: m.latitude,
      longitude: m.longitude,
      museumType: m.museumType,
    }));

    const entries = mergeAndDedupe(centerLat, centerLng, null, localWithCoords, osmResults);

    let filtered = entries;
    if (q) {
      const lower = q.toLowerCase();
      filtered = entries.filter((e) => e.name.toLowerCase().includes(lower));
    }

    filtered.sort((a, b) => a.distance - b.distance);
    return { museums: filtered, count: filtered.length };
  }

  private async executeRadiusSearch(input: SearchMuseumsInput): Promise<SearchMuseumsResult> {
    const { q } = input;
    let { lat, lng } = input;

    if ((lat == null || lng == null) && q) {
      const geocoded = await geocodeWithNominatim(q);
      if (geocoded) {
        lat = geocoded.lat;
        lng = geocoded.lng;
        logger.info('Geocoded text query to coordinates', { q, lat, lng });
      }
    }

    const localMuseums = await fetchLocalMuseumsWithCoords(this.repository);

    // No coords → return local DB museums only (no Overpass).
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

    const osmResults = await this.overpassSearch({ lat, lng, radiusMeters: radius });
    const entries = mergeAndDedupe(lat, lng, radius, localMuseums, osmResults);

    let filtered = entries;
    if (q) {
      const lower = q.toLowerCase();
      filtered = entries.filter((e) => e.name.toLowerCase().includes(lower));
    }

    filtered.sort((a, b) => a.distance - b.distance);
    return { museums: filtered, count: filtered.length };
  }

  /** Non-fatal on failure. */
  private async fetchLocalInBbox(bbox: BoundingBox): Promise<
    {
      name: string;
      address: string | null;
      latitude: number;
      longitude: number;
      museumType: MuseumCategory;
    }[]
  > {
    try {
      const rows = await this.repository.findInBoundingBox(bbox);
      return rows
        .filter(
          (m): m is typeof m & { latitude: number; longitude: number } =>
            m.latitude != null && m.longitude != null,
        )
        .map((m) => ({
          name: m.name,
          address: m.address ?? null,
          latitude: m.latitude,
          longitude: m.longitude,
          museumType: m.museumType,
        }));
    } catch (error) {
      logger.warn('Failed to fetch local museums in bbox', {
        error: error instanceof Error ? error.message : String(error),
        bbox,
      });
      return [];
    }
  }
}

function isSearchDeps(arg: CacheService | SearchMuseumsDeps | undefined): arg is SearchMuseumsDeps {
  if (!arg) return false;
  return 'cache' in arg || 'overpassSearch' in arg;
}
