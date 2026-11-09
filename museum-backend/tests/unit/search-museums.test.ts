import { SearchMuseumsUseCase } from '@modules/museum/useCase/search/searchMuseums.useCase';
import { InMemoryMuseumRepository } from 'tests/helpers/museum/inMemoryMuseumRepository';
import type { OverpassMuseumResult } from '@shared/http/overpass.client';
import type { NominatimGeocodingResult } from '@shared/http/nominatim.client';
import type { CacheService } from '@shared/cache/cache.port';

type OverpassQueryArgs = [{ bbox?: number[]; lat?: number; lng?: number; radiusMeters?: number }];
const mockQueryOverpassMuseums = jest.fn<Promise<OverpassMuseumResult[]>, OverpassQueryArgs>();

jest.mock('@shared/http/overpass.client', () => ({
  queryOverpassMuseums: (...args: OverpassQueryArgs) => mockQueryOverpassMuseums(...args),
  createCachedOverpassClient: () => mockQueryOverpassMuseums,
}));

const mockGeocodeWithNominatim = jest.fn<Promise<NominatimGeocodingResult | null>, []>();

jest.mock('@shared/http/nominatim.client', () => ({
  geocodeWithNominatim: (...args: unknown[]) => mockGeocodeWithNominatim(...(args as [])),
}));

jest.mock('@src/config/env', () => ({
  env: { overpassCacheTtlSeconds: 3600 },
}));

const PARIS = { lat: 48.8566, lng: 2.3522 };

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
    incrBy: jest.fn(async () => null),
    ping: jest.fn(async () => true),
    zadd: jest.fn(async () => {}),
    ztop: jest.fn(async () => []),
  };
}

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
    await repo.create({
      name: 'Louvre (local)',
      slug: 'louvre-local',
      latitude: 48.8606,
      longitude: 2.3376,
    });

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

    expect(result.museums).toHaveLength(1);
    expect(result.museums[0].name).toBe('Louvre (local)');
    expect(result.museums[0].source).toBe('local');
  });

  it('calculates distance correctly (haversine)', async () => {
    await repo.create({
      name: 'Nearby Museum',
      slug: 'nearby',
      latitude: PARIS.lat + 0.009,
      longitude: PARIS.lng,
    });

    const result = await useCase.execute({ ...PARIS, radiusMeters: 5000 });

    expect(result.museums).toHaveLength(1);
    expect(result.museums[0].distance).toBeGreaterThan(900);
    expect(result.museums[0].distance).toBeLessThan(1100);
  });

  it('sorts results by distance ascending', async () => {
    await repo.create({
      name: 'Far Museum',
      slug: 'far',
      latitude: PARIS.lat + 0.04,
      longitude: PARIS.lng,
    });

    await repo.create({
      name: 'Close Museum',
      slug: 'close',
      latitude: PARIS.lat + 0.001,
      longitude: PARIS.lng,
    });

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
    await repo.create({
      name: 'Very Far Museum',
      slug: 'very-far',
      latitude: PARIS.lat + 0.54,
      longitude: PARIS.lng,
    });

    await repo.create({
      name: 'Within Range',
      slug: 'within-range',
      latitude: PARIS.lat + 0.1,
      longitude: PARIS.lng,
    });

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

    mockQueryOverpassMuseums.mockResolvedValueOnce([]);

    const result = await useCase.execute({ ...PARIS, radiusMeters: 10_000 });

    expect(result.museums).toHaveLength(1);
    expect(result.museums[0].name).toBe('Louvre');
    expect(result.museums[0].source).toBe('local');
  });

  it('delegates Overpass lookups to the injected cached search fn (one call per execute)', async () => {
    const overpassSearch = jest.fn().mockResolvedValue([makeOsmResult('Injected', 0.001, 0.001)]);
    const cachedUseCase = new SearchMuseumsUseCase(repo, { overpassSearch });

    await cachedUseCase.execute({ ...PARIS, radiusMeters: 10_000 });
    expect(overpassSearch).toHaveBeenCalledTimes(1);
    expect(overpassSearch).toHaveBeenCalledWith({
      lat: PARIS.lat,
      lng: PARIS.lng,
      radiusMeters: 10_000,
    });

    await cachedUseCase.execute({ ...PARIS, radiusMeters: 10_000 });
    expect(overpassSearch).toHaveBeenCalledTimes(2);
    expect(mockQueryOverpassMuseums).not.toHaveBeenCalled();
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
    await repo.create({
      name: 'Within Default',
      slug: 'within-default',
      latitude: PARIS.lat + 0.07,
      longitude: PARIS.lng,
    });

    await repo.create({
      name: 'Also Within Default',
      slug: 'also-within-default',
      latitude: PARIS.lat + 0.22,
      longitude: PARIS.lng,
    });

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

    expect(mockQueryOverpassMuseums).not.toHaveBeenCalled();

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

  describe('bbox search', () => {
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
      await repo.create({
        name: 'Centro',
        slug: 'centro',
        latitude: 38.72,
        longitude: -9.14,
      });
      mockQueryOverpassMuseums.mockResolvedValueOnce([]);

      const result = await useCase.execute({ bbox: LISBON_BBOX });

      expect(result.museums).toHaveLength(1);
      expect(result.museums[0].distance).toBeLessThan(300);
    });
  });

  describe('Overpass cached-client DI wiring', () => {
    it('forwards a radius search via the cached client factory wired from the injected cache', async () => {
      const cache = createMockCache();
      const cachedUseCase = new SearchMuseumsUseCase(repo, cache);

      const osmResults = [makeOsmResult('Fresh Museum', 0.001, 0.001, 555)];
      mockQueryOverpassMuseums.mockResolvedValueOnce(osmResults);

      const result = await cachedUseCase.execute({ ...PARIS, radiusMeters: 3000 });

      expect(mockQueryOverpassMuseums).toHaveBeenCalledTimes(1);
      expect(mockQueryOverpassMuseums).toHaveBeenCalledWith({
        lat: PARIS.lat,
        lng: PARIS.lng,
        radiusMeters: 3000,
      });
      expect(result.museums.some((m) => m.name === 'Fresh Museum' && m.source === 'osm')).toBe(
        true,
      );
    });

    it('forwards bbox payloads through the cached client as-is', async () => {
      const cache = createMockCache();
      const cachedUseCase = new SearchMuseumsUseCase(repo, cache);

      mockQueryOverpassMuseums.mockResolvedValueOnce([]);

      const bbox: [number, number, number, number] = [-9.18, 38.69, -9.1, 38.75];
      await cachedUseCase.execute({ bbox });

      expect(mockQueryOverpassMuseums).toHaveBeenCalledTimes(1);
      const [callArgs] = mockQueryOverpassMuseums.mock.calls[0];
      expect(callArgs.bbox).toEqual(bbox);
      expect(callArgs.lat).toBeUndefined();
    });
  });

  describe('OSM deduplication with name similarity', () => {
    const CAPC = { lat: 44.8497, lng: -0.5714 };

    it('collapses duplicate OSM entries for CAPC when a local CAPC exists (short vs long name, >100m apart)', async () => {
      await repo.create({
        name: 'CAPC',
        slug: 'capc',
        latitude: CAPC.lat,
        longitude: CAPC.lng,
      });

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
