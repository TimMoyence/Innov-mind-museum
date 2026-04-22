import { SearchMuseumsUseCase } from '@modules/museum/useCase/searchMuseums.useCase';
import { InMemoryMuseumRepository } from 'tests/helpers/museum/inMemoryMuseumRepository';
import type { OverpassMuseumResult } from '@shared/http/overpass.client';
import type { NominatimGeocodingResult } from '@shared/http/nominatim.client';
import type { CacheService } from '@shared/cache/cache.port';

/* ------------------------------------------------------------------ */
/*  Mock: Overpass client                                              */
/* ------------------------------------------------------------------ */
type OverpassQueryArgs = [{ bbox?: number[]; lat?: number; lng?: number; radiusMeters?: number }];
const mockQueryOverpassMuseums = jest.fn<Promise<OverpassMuseumResult[]>, OverpassQueryArgs>();

jest.mock('@shared/http/overpass.client', () => ({
  queryOverpassMuseums: (...args: OverpassQueryArgs) => mockQueryOverpassMuseums(...args),
}));

/* ------------------------------------------------------------------ */
/*  Mock: Nominatim client                                             */
/* ------------------------------------------------------------------ */
const mockGeocodeWithNominatim = jest.fn<Promise<NominatimGeocodingResult | null>, []>();

jest.mock('@shared/http/nominatim.client', () => ({
  geocodeWithNominatim: (...args: unknown[]) => mockGeocodeWithNominatim(...(args as [])),
}));

/* ------------------------------------------------------------------ */
/*  Mock: env (needed for cache TTL)                                   */
/* ------------------------------------------------------------------ */
jest.mock('@src/config/env', () => ({
  env: { overpassCacheTtlSeconds: 3600 },
}));

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Paris coordinates (reference point for all tests). */
const PARIS = { lat: 48.8566, lng: 2.3522 };

/**
 * Creates an OSM result near a given offset from Paris.
 * @param name
 * @param latOffset
 * @param lonOffset
 * @param osmId
 */
const makeOsmResult = (
  name: string,
  latOffset: number,
  lonOffset: number,
  osmId = 100,
): OverpassMuseumResult => ({
  name,
  address: null,
  latitude: PARIS.lat + latOffset,
  longitude: PARIS.lng + lonOffset,
  osmId,
  museumType: 'general',
});

/** Creates a minimal in-memory cache for testing. */
function createMockCache(): CacheService {
  const store = new Map<string, unknown>();
  return {
    get: jest.fn(async (key: string) => {
      return store.get(key) ?? null;
    }) as CacheService['get'],
    set: jest.fn(async (key: string, value: unknown, _ttl?: number) => {
      store.set(key, value);
    }) as CacheService['set'],
    del: jest.fn(async () => {}),
    delByPrefix: jest.fn(async () => {}),
    setNx: jest.fn(async () => true) as CacheService['setNx'],
    ping: jest.fn(async () => true),
    zadd: jest.fn(async () => {}),
    ztop: jest.fn(async () => []),
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('SearchMuseumsUseCase', () => {
  let repo: InMemoryMuseumRepository;
  let useCase: SearchMuseumsUseCase;

  beforeEach(() => {
    repo = new InMemoryMuseumRepository();
    useCase = new SearchMuseumsUseCase(repo);
    mockQueryOverpassMuseums.mockReset();
    mockQueryOverpassMuseums.mockResolvedValue([]);
    mockGeocodeWithNominatim.mockReset();
    mockGeocodeWithNominatim.mockResolvedValue(null);
  });

  it('returns merged results from Overpass + local DB', async () => {
    await repo.create({
      name: 'Louvre',
      slug: 'louvre',
      latitude: 48.8606,
      longitude: 2.3376,
    });

    mockQueryOverpassMuseums.mockResolvedValueOnce([
      makeOsmResult('Palais de Tokyo', 0.005, -0.05, 200),
    ]);

    const result = await useCase.execute({ ...PARIS, radiusMeters: 10_000 });

    expect(result.museums).toHaveLength(2);
    expect(result.count).toBe(2);

    const names = result.museums.map((m) => m.name);
    expect(names).toContain('Louvre');
    expect(names).toContain('Palais de Tokyo');
  });

  it('deduplicates by proximity — prefers local when within 100m', async () => {
    // Local museum at exact coords
    await repo.create({
      name: 'Louvre (local)',
      slug: 'louvre-local',
      latitude: 48.8606,
      longitude: 2.3376,
    });

    // OSM result within ~10m of the local museum
    mockQueryOverpassMuseums.mockResolvedValueOnce([
      {
        name: 'Louvre (osm)',
        address: null,
        latitude: 48.8607,
        longitude: 2.3377,
        osmId: 999,
        museumType: 'art',
      },
    ]);

    const result = await useCase.execute({ ...PARIS, radiusMeters: 10_000 });

    // Only the local version should survive
    expect(result.museums).toHaveLength(1);
    expect(result.museums[0].name).toBe('Louvre (local)');
    expect(result.museums[0].source).toBe('local');
  });

  it('calculates distance correctly (haversine)', async () => {
    // Place museum ~1km north of PARIS center
    // ~0.009 degrees latitude is approximately 1km
    await repo.create({
      name: 'Nearby Museum',
      slug: 'nearby',
      latitude: PARIS.lat + 0.009,
      longitude: PARIS.lng,
    });

    const result = await useCase.execute({ ...PARIS, radiusMeters: 5000 });

    expect(result.museums).toHaveLength(1);
    // Distance should be ~1000m (haversine allows some tolerance)
    expect(result.museums[0].distance).toBeGreaterThan(900);
    expect(result.museums[0].distance).toBeLessThan(1100);
  });

  it('sorts results by distance ascending', async () => {
    // Far museum
    await repo.create({
      name: 'Far Museum',
      slug: 'far',
      latitude: PARIS.lat + 0.04,
      longitude: PARIS.lng,
    });

    // Close museum
    await repo.create({
      name: 'Close Museum',
      slug: 'close',
      latitude: PARIS.lat + 0.001,
      longitude: PARIS.lng,
    });

    // Medium museum
    await repo.create({
      name: 'Medium Museum',
      slug: 'medium',
      latitude: PARIS.lat + 0.02,
      longitude: PARIS.lng,
    });

    const result = await useCase.execute({ ...PARIS, radiusMeters: 50_000 });

    expect(result.museums.map((m) => m.name)).toEqual([
      'Close Museum',
      'Medium Museum',
      'Far Museum',
    ]);
  });

  it('respects max radius (caps at 50km)', async () => {
    // Museum at ~60km away (~0.54 degrees latitude)
    await repo.create({
      name: 'Very Far Museum',
      slug: 'very-far',
      latitude: PARIS.lat + 0.54,
      longitude: PARIS.lng,
    });

    // Museum within 50km
    await repo.create({
      name: 'Within Range',
      slug: 'within-range',
      latitude: PARIS.lat + 0.1,
      longitude: PARIS.lng,
    });

    // Request radius of 100km — should be capped to 50km
    const result = await useCase.execute({ ...PARIS, radiusMeters: 100_000 });

    expect(result.museums).toHaveLength(1);
    expect(result.museums[0].name).toBe('Within Range');
  });

  it('falls back to local-only when Overpass fails', async () => {
    await repo.create({
      name: 'Louvre',
      slug: 'louvre',
      latitude: 48.8606,
      longitude: 2.3376,
    });

    // Overpass returns empty on failure (the client catches errors internally)
    mockQueryOverpassMuseums.mockResolvedValueOnce([]);

    const result = await useCase.execute({ ...PARIS, radiusMeters: 10_000 });

    expect(result.museums).toHaveLength(1);
    expect(result.museums[0].name).toBe('Louvre');
    expect(result.museums[0].source).toBe('local');
  });

  it('uses cache on second call', async () => {
    const cache = createMockCache();
    const cachedUseCase = new SearchMuseumsUseCase(repo, cache);

    const osmResults = [makeOsmResult('Cached Museum', 0.001, 0.001, 300)];
    mockQueryOverpassMuseums.mockResolvedValueOnce(osmResults);

    // First call — should fetch from Overpass and cache
    await cachedUseCase.execute({ ...PARIS, radiusMeters: 10_000 });
    expect(mockQueryOverpassMuseums).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledTimes(1);

    // Second call — should use cache, not call Overpass again
    await cachedUseCase.execute({ ...PARIS, radiusMeters: 10_000 });
    expect(mockQueryOverpassMuseums).toHaveBeenCalledTimes(1); // still 1
    expect(cache.get).toHaveBeenCalledTimes(2);
  });

  it('filters results by q parameter', async () => {
    await repo.create({
      name: 'Louvre Museum',
      slug: 'louvre',
      latitude: 48.8606,
      longitude: 2.3376,
    });

    await repo.create({
      name: "Musee d'Orsay",
      slug: 'orsay',
      latitude: 48.8599,
      longitude: 2.3266,
    });

    mockQueryOverpassMuseums.mockResolvedValueOnce([
      makeOsmResult('Palais de Tokyo', 0.005, -0.05, 200),
    ]);

    const result = await useCase.execute({ ...PARIS, radiusMeters: 10_000, q: 'louvre' });

    expect(result.museums).toHaveLength(1);
    expect(result.museums[0].name).toBe('Louvre Museum');
  });

  it('returns source "local" for DB museums and "osm" for Overpass results', async () => {
    await repo.create({
      name: 'Local Museum',
      slug: 'local',
      latitude: PARIS.lat + 0.001,
      longitude: PARIS.lng,
    });

    mockQueryOverpassMuseums.mockResolvedValueOnce([makeOsmResult('OSM Museum', 0.01, 0.01, 500)]);

    const result = await useCase.execute({ ...PARIS, radiusMeters: 10_000 });

    const local = result.museums.find((m) => m.name === 'Local Museum');
    const osm = result.museums.find((m) => m.name === 'OSM Museum');

    expect(local?.source).toBe('local');
    expect(osm?.source).toBe('osm');
  });

  it('uses default radius of 30km when not provided', async () => {
    // Museum at ~8km (within default 30km radius)
    await repo.create({
      name: 'Within Default',
      slug: 'within-default',
      latitude: PARIS.lat + 0.07,
      longitude: PARIS.lng,
    });

    // Museum at ~25km (within default 30km radius)
    await repo.create({
      name: 'Also Within Default',
      slug: 'also-within-default',
      latitude: PARIS.lat + 0.22,
      longitude: PARIS.lng,
    });

    // Museum at ~40km (outside default 30km radius)
    await repo.create({
      name: 'Outside Default',
      slug: 'outside-default',
      latitude: PARIS.lat + 0.36,
      longitude: PARIS.lng,
    });

    const result = await useCase.execute({ lat: PARIS.lat, lng: PARIS.lng });

    expect(result.museums).toHaveLength(2);
    const names = result.museums.map((m) => m.name);
    expect(names).toContain('Within Default');
    expect(names).toContain('Also Within Default');
    expect(names).not.toContain('Outside Default');
  });

  it('excludes local museums without coordinates', async () => {
    await repo.create({
      name: 'No Coords Museum',
      slug: 'no-coords',
      // no latitude/longitude
    });

    await repo.create({
      name: 'Has Coords Museum',
      slug: 'has-coords',
      latitude: PARIS.lat + 0.001,
      longitude: PARIS.lng,
    });

    const result = await useCase.execute({ ...PARIS, radiusMeters: 10_000 });

    expect(result.museums).toHaveLength(1);
    expect(result.museums[0].name).toBe('Has Coords Museum');
  });

  it('geocodes text-only search via Nominatim then searches Overpass', async () => {
    // Nominatim resolves "Lyon" to Lyon coordinates
    const LYON = { lat: 45.764, lng: 4.8357 };
    mockGeocodeWithNominatim.mockResolvedValueOnce(LYON);

    mockQueryOverpassMuseums.mockResolvedValueOnce([
      {
        name: 'Musee des Beaux-Arts de Lyon',
        address: null,
        latitude: 45.767,
        longitude: 4.833,
        osmId: 400,
        museumType: 'art',
      },
    ]);

    const result = await useCase.execute({ q: 'Lyon' });

    expect(mockGeocodeWithNominatim).toHaveBeenCalledWith('Lyon');
    expect(mockQueryOverpassMuseums).toHaveBeenCalledTimes(1);
    expect(result.museums).toHaveLength(1);
    expect(result.museums[0].name).toBe('Musee des Beaux-Arts de Lyon');
    expect(result.museums[0].source).toBe('osm');
  });

  it('returns local DB museums only when no params provided', async () => {
    await repo.create({
      name: 'Generic Museum',
      slug: 'generic',
      latitude: 48.86,
      longitude: 2.34,
    });

    const result = await useCase.execute({});

    // No coordinates → no Overpass call, no Nominatim call
    expect(mockQueryOverpassMuseums).not.toHaveBeenCalled();
    expect(mockGeocodeWithNominatim).not.toHaveBeenCalled();

    expect(result.museums).toHaveLength(1);
    expect(result.museums[0].name).toBe('Generic Museum');
    expect(result.museums[0].source).toBe('local');
    expect(result.museums[0].distance).toBe(0);
  });

  it('falls back to local DB when Nominatim geocoding fails', async () => {
    mockGeocodeWithNominatim.mockResolvedValueOnce(null);

    await repo.create({
      name: 'Musee de Lyon',
      slug: 'lyon-museum',
      latitude: 45.764,
      longitude: 4.836,
    });

    await repo.create({
      name: 'Musee de Paris',
      slug: 'paris-museum',
      latitude: 48.86,
      longitude: 2.34,
    });

    const result = await useCase.execute({ q: 'Lyon' });

    // Nominatim failed → no coordinates → no Overpass
    expect(mockQueryOverpassMuseums).not.toHaveBeenCalled();

    // Should filter local museums by q
    expect(result.museums).toHaveLength(1);
    expect(result.museums[0].name).toBe('Musee de Lyon');
  });

  it('skips Nominatim when lat/lng are already provided', async () => {
    mockQueryOverpassMuseums.mockResolvedValueOnce([]);

    const result = await useCase.execute({ ...PARIS, q: 'test' });

    expect(mockGeocodeWithNominatim).not.toHaveBeenCalled();
    expect(mockQueryOverpassMuseums).toHaveBeenCalledTimes(1);
    expect(result.museums).toHaveLength(0);
  });

  /* ---------------------------------------------------------------- */
  /*  Bbox search branch                                              */
  /* ---------------------------------------------------------------- */

  describe('bbox search', () => {
    /** Lisbon-ish bbox: ~5km square around 38.72/-9.14. */
    const LISBON_BBOX: [number, number, number, number] = [-9.18, 38.69, -9.1, 38.75];

    it('returns local museums whose coordinates fall inside the bbox', async () => {
      await repo.create({
        name: 'Museu Nacional do Azulejo',
        slug: 'azulejo',
        latitude: 38.7245,
        longitude: -9.1133,
      });
      await repo.create({
        name: 'Far Away',
        slug: 'far-away',
        latitude: 48.8566,
        longitude: 2.3522,
      });
      mockQueryOverpassMuseums.mockResolvedValueOnce([]);

      const result = await useCase.execute({ bbox: LISBON_BBOX });

      expect(result.count).toBe(1);
      expect(result.museums[0].name).toBe('Museu Nacional do Azulejo');
    });

    it('passes bbox (not lat/lng) to the Overpass client', async () => {
      mockQueryOverpassMuseums.mockResolvedValueOnce([]);

      await useCase.execute({ bbox: LISBON_BBOX });

      expect(mockQueryOverpassMuseums).toHaveBeenCalledTimes(1);
      const [callArgs] = mockQueryOverpassMuseums.mock.calls[0];
      expect(callArgs.bbox).toEqual(LISBON_BBOX);
    });

    it('takes precedence over lat/lng/radius when both are provided', async () => {
      mockQueryOverpassMuseums.mockResolvedValueOnce([]);

      await useCase.execute({ ...PARIS, radiusMeters: 5_000, bbox: LISBON_BBOX });

      // Only the bbox query path should be used; the radius path uses a different cache key.
      expect(mockQueryOverpassMuseums).toHaveBeenCalledTimes(1);
      const [callArgs] = mockQueryOverpassMuseums.mock.calls[0];
      expect(callArgs.bbox).toEqual(LISBON_BBOX);
      expect(callArgs.lat).toBeUndefined();
    });

    it('does NOT trigger geocoding fallback even when q is set', async () => {
      mockQueryOverpassMuseums.mockResolvedValueOnce([]);

      await useCase.execute({ bbox: LISBON_BBOX, q: 'Lyon' });

      expect(mockGeocodeWithNominatim).not.toHaveBeenCalled();
    });

    it('measures distance from the bbox center', async () => {
      // bbox center ≈ (38.72, -9.14)
      await repo.create({
        name: 'Centro',
        slug: 'centro',
        latitude: 38.72,
        longitude: -9.14,
      });
      mockQueryOverpassMuseums.mockResolvedValueOnce([]);

      const result = await useCase.execute({ bbox: LISBON_BBOX });

      expect(result.museums).toHaveLength(1);
      // Distance from centro to bbox center should be small (<300m given rounding).
      expect(result.museums[0].distance).toBeLessThan(300);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  OSM deduplication with name similarity                          */
  /* ---------------------------------------------------------------- */

  /* ---------------------------------------------------------------- */
  /*  Overpass cache behavior                                          */
  /* ---------------------------------------------------------------- */

  describe('Overpass cache behavior', () => {
    /**
     * Negative-cache TTL in seconds — duplicated from the useCase constant
     * (NEGATIVE_CACHE_TTL_SECONDS) so the test will fail loudly if prod drifts.
     */
    const NEGATIVE_TTL = 300;
    /** Positive-cache TTL — matches the env mock at the top of this file. */
    const POSITIVE_TTL = 3600;

    it('returns cached Overpass results and skips queryOverpassMuseums on cache hit', async () => {
      const cache = createMockCache();
      const cachedUseCase = new SearchMuseumsUseCase(repo, cache);

      const cacheKey = `osm:museums:${PARIS.lat.toFixed(2)}:${PARIS.lng.toFixed(2)}:3000`;
      const cached = [makeOsmResult('Cached Louvre', 0.001, 0.001, 777)];

      // Prime the cache under the deterministic key the useCase builds.
      (cache.get as jest.Mock).mockImplementationOnce(async (key: string) =>
        key === cacheKey ? cached : null,
      );

      const result = await cachedUseCase.execute({ ...PARIS, radiusMeters: 3000 });

      expect(cache.get).toHaveBeenCalledWith(cacheKey);
      expect(mockQueryOverpassMuseums).not.toHaveBeenCalled();
      expect(cache.set).not.toHaveBeenCalled();
      // The cached OSM entry surfaces in the merged results.
      expect(result.museums.some((m) => m.name === 'Cached Louvre' && m.source === 'osm')).toBe(
        true,
      );
    });

    it('calls Overpass and caches with the success TTL on a cache miss', async () => {
      const cache = createMockCache();
      const cachedUseCase = new SearchMuseumsUseCase(repo, cache);

      const cacheKey = `osm:museums:${PARIS.lat.toFixed(2)}:${PARIS.lng.toFixed(2)}:3000`;
      const osmResults = [makeOsmResult('Fresh Museum', 0.001, 0.001, 555)];
      mockQueryOverpassMuseums.mockResolvedValueOnce(osmResults);

      await cachedUseCase.execute({ ...PARIS, radiusMeters: 3000 });

      expect(cache.get).toHaveBeenCalledWith(cacheKey);
      expect(mockQueryOverpassMuseums).toHaveBeenCalledTimes(1);
      expect(cache.set).toHaveBeenCalledTimes(1);
      const [setKey, setValue, setTtl] = (cache.set as jest.Mock).mock.calls[0];
      expect(setKey).toBe(cacheKey);
      expect(setValue).toEqual(osmResults);
      // Non-empty result → env-driven success TTL (not the negative TTL).
      expect(setTtl).toBe(POSITIVE_TTL);
    });

    it('caches an empty Overpass response with the short negative TTL (300s)', async () => {
      const cache = createMockCache();
      const cachedUseCase = new SearchMuseumsUseCase(repo, cache);

      mockQueryOverpassMuseums.mockResolvedValueOnce([]);

      await cachedUseCase.execute({ ...PARIS, radiusMeters: 3000 });

      expect(cache.set).toHaveBeenCalledTimes(1);
      const [, setValue, setTtl] = (cache.set as jest.Mock).mock.calls[0];
      expect(setValue).toEqual([]);
      // Empty result path must use NEGATIVE_CACHE_TTL_SECONDS = 300, not the
      // long positive TTL — protects against hammering a failing Overpass.
      expect(setTtl).toBe(NEGATIVE_TTL);
    });

    it('bbox search uses a separate cache key namespace (osm:museums:bbox:...)', async () => {
      const cache = createMockCache();
      const cachedUseCase = new SearchMuseumsUseCase(repo, cache);

      mockQueryOverpassMuseums.mockResolvedValueOnce([]);

      const bbox: [number, number, number, number] = [-9.18, 38.69, -9.1, 38.75];
      await cachedUseCase.execute({ bbox });

      // The bbox branch must NOT touch the radius cache key namespace.
      const keysGot = (cache.get as jest.Mock).mock.calls.map((c) => c[0] as string);
      expect(keysGot).toHaveLength(1);
      expect(keysGot[0]).toMatch(/^osm:museums:bbox:/);
      // Key encodes the four bbox corners at 2-decimal precision.
      expect(keysGot[0]).toBe('osm:museums:bbox:-9.18,38.69,-9.10,38.75');
    });
  });

  describe('OSM deduplication with name similarity', () => {
    /** Bordeaux CAPC coordinates (reference for CAPC dedup scenarios). */
    const CAPC = { lat: 44.8497, lng: -0.5714 };

    it('collapses duplicate OSM entries for CAPC when a local CAPC exists (short vs long name, >100m apart)', async () => {
      // Local CAPC at exact museum coords.
      await repo.create({
        name: 'CAPC',
        slug: 'capc',
        latitude: CAPC.lat,
        longitude: CAPC.lng,
      });

      // Two OSM duplicates:
      //   A: co-located with local → dropped by pure-distance rule (<100m).
      //   B: ~164m away with a similar but longer name → dropped by
      //      name-gated rule (<500m AND similar names).
      mockQueryOverpassMuseums.mockResolvedValueOnce([
        {
          name: "CAPC musée d'art contemporain",
          address: null,
          latitude: CAPC.lat,
          longitude: CAPC.lng,
          osmId: 101,
          museumType: 'art',
        },
        {
          name: 'CAPC contemporary art',
          address: null,
          latitude: 44.8503,
          longitude: -0.5695,
          osmId: 102,
          museumType: 'art',
        },
      ]);

      const result = await useCase.execute({ lat: CAPC.lat, lng: CAPC.lng, radiusMeters: 10_000 });

      expect(result.count).toBe(1);
      expect(result.museums[0].name).toBe('CAPC');
      expect(result.museums[0].source).toBe('local');
    });

    it('collapses two OSM entries 50m apart into one (Louvre duplicate nodes)', async () => {
      // No local museum — we want to see that OSM<->OSM dedup happens
      // before merging with locals.
      mockQueryOverpassMuseums.mockResolvedValueOnce([
        {
          name: 'Musée du Louvre',
          address: 'Rue de Rivoli',
          latitude: 48.8606,
          longitude: 2.3376,
          osmId: 201,
          museumType: 'art',
        },
        {
          name: 'Musée du Louvre',
          address: null,
          latitude: 48.861,
          longitude: 2.3378,
          osmId: 202,
          museumType: 'art',
        },
      ]);

      const result = await useCase.execute({ lat: 48.8606, lng: 2.3376, radiusMeters: 5000 });

      expect(result.count).toBe(1);
      expect(result.museums[0].name).toBe('Musée du Louvre');
      expect(result.museums[0].source).toBe('osm');
      // Representative pick should be the one with the richer address.
      expect(result.museums[0].address).toBe('Rue de Rivoli');
    });

    it('keeps the local Orsay entry and drops the OSM Orsay ~300m away (name-gated merge)', async () => {
      await repo.create({
        name: "Musée d'Orsay",
        slug: 'orsay',
        latitude: 48.86,
        longitude: 2.3266,
      });

      mockQueryOverpassMuseums.mockResolvedValueOnce([
        {
          name: "Musée d'Orsay",
          address: null,
          latitude: 48.8625,
          longitude: 2.328,
          osmId: 301,
          museumType: 'art',
        },
      ]);

      const result = await useCase.execute({ lat: 48.86, lng: 2.3266, radiusMeters: 5000 });

      expect(result.count).toBe(1);
      expect(result.museums[0].name).toBe("Musée d'Orsay");
      expect(result.museums[0].source).toBe('local');
    });

    it('keeps two distinct OSM museums 200m apart when their names differ', async () => {
      // Picasso + Carnavalet: real Paris-Marais neighbours, ~200m apart,
      // NOT the same museum. Name similarity must save them.
      mockQueryOverpassMuseums.mockResolvedValueOnce([
        {
          name: 'Musée Picasso',
          address: null,
          latitude: 48.86,
          longitude: 2.36,
          osmId: 401,
          museumType: 'art',
        },
        {
          name: 'Musée Carnavalet',
          address: null,
          latitude: 48.8618,
          longitude: 2.36,
          osmId: 402,
          museumType: 'art',
        },
      ]);

      const result = await useCase.execute({ lat: 48.86, lng: 2.36, radiusMeters: 5000 });

      expect(result.count).toBe(2);
      const names = result.museums.map((m) => m.name).sort();
      expect(names).toEqual(['Musée Carnavalet', 'Musée Picasso']);
    });
  });
});
