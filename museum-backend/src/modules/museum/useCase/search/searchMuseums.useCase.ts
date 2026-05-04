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
} from '../../domain/museum/museum.repository.interface';
import type { CacheService } from '@shared/cache/cache.port';

export type { MuseumCategory } from '@shared/http/overpass.client';

/**
 * Input for the museum search use case. Either `bbox` (rectangular search) or
 * the `lat`/`lng`/`radiusMeters` triplet (circular search around a point) is
 * accepted. When both are present, `bbox` wins.
 */
export interface SearchMuseumsInput {
  lat?: number;
  lng?: number;
  radiusMeters?: number;
  q?: string;
  bbox?: BoundingBox;
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
  /**
   * Optional OSM-sourced metadata. Present only on `source: 'osm'` entries
   * when the originating OSM element carried the corresponding tag. Local
   * DB-backed entries leave these undefined — clients can fall back to the
   * dedicated enrichment endpoint for richer data.
   */
  openingHours?: string;
  website?: string;
  phone?: string;
  imageUrl?: string;
  description?: string;
  /** Raw OSM `wheelchair` value: `yes` | `no` | `limited` | `designated`. */
  wheelchair?: string;
}

/** Search results returned by the use case. */
export interface SearchMuseumsResult {
  museums: SearchMuseumEntry[];
  count: number;
}

const DEFAULT_RADIUS = 30_000;
const MAX_RADIUS = 50_000;
/** Pure-distance threshold: two OSM entries this close are always merged (covers duplicate OSM nodes for the same building). */
const DEDUP_OSM_OSM_METERS = 100;
/** Pure-distance threshold for OSM vs local: below this, drop the OSM entry regardless of name. */
const DEDUP_OSM_LOCAL_PURE_METERS = 100;
/** Name-gated distance threshold for OSM vs local: up to this distance, drop the OSM entry only if names match. */
const DEDUP_OSM_LOCAL_DISTANCE_METERS = 500;

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

/**
 * Collapses OSM-only duplicates using 2-pass clustering.
 *
 * Pass 1 (union-find): two OSM entries are unioned if EITHER
 *   - their names pass the similarity check (`museumNamesAreSimilar`), OR
 *   - they sit within `DEDUP_OSM_OSM_METERS` of each other.
 *
 * Pass 2 (representative pick): for each cluster, keep the entry with the
 * longest address (richer metadata); tiebreak on longest name.
 *
 * Deterministic: input order is preserved for representative selection when
 * lengths tie, because `clusters` is built by scanning indices in order.
 */
function dedupeOsmResults(osmResults: OverpassMuseumResult[]): OverpassMuseumResult[] {
  const n = osmResults.length;
  if (n <= 1) return [...osmResults];

  // Union-find over indices.
  const parent: number[] = Array.from({ length: n }, (_, i) => i);

  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    // Path compression.
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

  // Group indices by cluster root.
  const clusters = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const bucket = clusters.get(root);
    if (bucket) bucket.push(i);
    else clusters.set(root, [i]);
  }

  // Pick one representative per cluster: longest address, tiebreak longest name.
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
 * Tests whether an OSM entry duplicates any local museum.
 *
 * An OSM entry is considered a duplicate if EITHER:
 *   - it sits within `DEDUP_OSM_LOCAL_PURE_METERS` of a local museum (pure
 *     distance, names don't need to match — covers the case where OSM and
 *     local agree on coords but names diverge), OR
 *   - it sits within `DEDUP_OSM_LOCAL_DISTANCE_METERS` of a local museum AND
 *     the names pass the similarity check (covers the case where OSM places
 *     a museum several hundred meters off from the local record, but the
 *     name makes clear they refer to the same institution).
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
 * Merges local + OSM results into `SearchMuseumEntry` list, applying:
 *   1. OSM<->OSM deduplication (clusters duplicate OSM nodes).
 *   2. OSM vs local deduplication (drops OSM entries that duplicate a local).
 *   3. Optional radius filtering on locals (radius search only).
 *
 * Distance is measured from (`centerLat`, `centerLng`) for every output entry.
 * When `radius` is `null`, no radius filter is applied on locals (bbox mode).
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
 * Optional dependencies for {@link SearchMuseumsUseCase}.
 *
 * The Overpass search is injected as a pre-cached function so the TTLs,
 * sentinel wrapping and probabilistic early-expiration live in
 * `shared/http/overpass.client.ts` (the infrastructure boundary) — this use
 * case is no longer aware of cache key shapes. Passing `cache` alone is
 * supported for backwards-compat: the factory wires the cached fn for you.
 */
export interface SearchMuseumsDeps {
  cache?: CacheService;
  /**
   * Pre-built cached Overpass search fn (usually from
   * {@link createCachedOverpassClient}). Primarily for test injection; in
   * production wiring it is derived from `cache`.
   */
  overpassSearch?: CachedOverpassSearchFn;
}

/** Searches for museums near a location by merging Overpass API and local DB results. */
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
      // No cache and no explicit fn — fall back to raw live calls.
      // Only hit in tests / scripts; production wiring always passes cache.
      this.overpassSearch = (params) => queryOverpassMuseums(params);
    }
  }

  /** Executes the search, merging OSM and local results with deduplication and distance sorting. */
  async execute(input: SearchMuseumsInput): Promise<SearchMuseumsResult> {
    if (input.bbox) {
      return await this.executeBboxSearch(input.bbox, input.q);
    }
    return await this.executeRadiusSearch(input);
  }

  /** Executes a rectangular bbox search; distance is measured from the bbox center. */
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

  /** Executes the original center+radius search (with optional geocoding fallback). */
  private async executeRadiusSearch(input: SearchMuseumsInput): Promise<SearchMuseumsResult> {
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

  /** Loads local museums whose coordinates fall inside the bbox; non-fatal on failure. */
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

/**
 * Narrow a constructor argument to the deps-bag shape. Plain CacheService
 * objects expose functions like `get`, never `cache` / `overpassSearch`, so
 * presence of either sentinel key means it's a deps bag.
 */
function isSearchDeps(arg: CacheService | SearchMuseumsDeps | undefined): arg is SearchMuseumsDeps {
  if (!arg) return false;
  return 'cache' in arg || 'overpassSearch' in arg;
}
