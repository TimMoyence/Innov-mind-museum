import { SearchMuseumsUseCase } from '@modules/museum/useCase/search/searchMuseums.useCase';
import { InMemoryMuseumRepository } from 'tests/helpers/museum/inMemoryMuseumRepository';

import type { CacheService } from '@shared/cache/cache.port';
import type { OverpassMuseumResult } from '@shared/http/overpass.client';
import type { NominatimGeocodingResult } from '@shared/http/nominatim.client';

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

const mockLoggerInfo = jest.fn();
jest.mock('@shared/logger/logger', () => ({
  logger: {
    info: (...args: unknown[]) => mockLoggerInfo(...args),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const PARIS = { lat: 48.8566, lng: 2.3522 };

const METERS_PER_DEG_LAT = 111_320;

function latOffsetMeters(meters: number): number {
  return meters / METERS_PER_DEG_LAT;
}

function makeOsm(
  overrides: Partial<OverpassMuseumResult> &
    Pick<OverpassMuseumResult, 'name' | 'latitude' | 'longitude'>,
): OverpassMuseumResult {
  return {
    address: null,
    museumType: 'museum' as const,
    ...overrides,
  } as OverpassMuseumResult;
}

async function seedLocal(
  repo: InMemoryMuseumRepository,
  museums: Array<{
    name: string;
    slug: string;
    latitude: number | null;
    longitude: number | null;
    address?: string | null;
  }>,
): Promise<void> {
  for (const m of museums) {
    await repo.create({
      name: m.name,
      slug: m.slug,
      address: m.address ?? undefined,
      latitude: m.latitude,
      longitude: m.longitude,
    });
  }
}

describe('SearchMuseumsUseCase — mutation kills', () => {
  let repo: InMemoryMuseumRepository;
  let useCase: SearchMuseumsUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLoggerInfo.mockReset();
    repo = new InMemoryMuseumRepository();
    useCase = new SearchMuseumsUseCase(repo);
  });

  describe('null-coordinate filtering (L89 + L423)', () => {
    it('excludes local museums with null latitude (kills `if (true)` ConditionalExpression on L89)', async () => {
      await seedLocal(repo, [
        { name: 'NoCoords', slug: 'no-coords', latitude: null, longitude: null },
        { name: 'WithCoords', slug: 'with-coords', latitude: PARIS.lat, longitude: PARIS.lng },
      ]);
      mockQueryOverpassMuseums.mockResolvedValue([]);

      const res = await useCase.execute({ lat: PARIS.lat, lng: PARIS.lng, radiusMeters: 10_000 });

      expect(res.museums.map((m) => m.name)).toEqual(['WithCoords']);
    });

    it('excludes a bbox-local museum when one of its coordinates is null (kills L423 `true` + LogicalOperator)', async () => {
      await seedLocal(repo, [
        { name: 'NoLng', slug: 'no-lng', latitude: PARIS.lat, longitude: null },
        { name: 'FullCoords', slug: 'full-coords', latitude: PARIS.lat, longitude: PARIS.lng },
      ]);
      mockQueryOverpassMuseums.mockResolvedValue([]);

      const bbox: [number, number, number, number] = [
        PARIS.lng - 0.1,
        PARIS.lat - 0.1,
        PARIS.lng + 0.1,
        PARIS.lat + 0.1,
      ];
      const res = await useCase.execute({ bbox });

      expect(res.museums.map((m) => m.name)).toEqual(['FullCoords']);
    });
  });

  describe('address nullish-coalescing (L92 / L341 / L427)', () => {
    it('preserves a non-null address through fetchLocalMuseumsWithCoords (kills `?? null` → `&& null`)', async () => {
      await seedLocal(repo, [
        {
          name: 'AddrMuseum',
          slug: 'addr',
          latitude: PARIS.lat,
          longitude: PARIS.lng,
          address: '123 Rue de Rivoli',
        },
      ]);
      mockQueryOverpassMuseums.mockResolvedValue([]);

      const res = await useCase.execute({ lat: PARIS.lat, lng: PARIS.lng, radiusMeters: 10_000 });

      expect(res.museums).toHaveLength(1);
      expect(res.museums[0].address).toBe('123 Rue de Rivoli');
    });

    it('preserves a non-null address in the bbox path (kills L341 / L427 `?? null` → `&& null`)', async () => {
      await seedLocal(repo, [
        {
          name: 'BboxMuseum',
          slug: 'bbox-addr',
          latitude: PARIS.lat,
          longitude: PARIS.lng,
          address: '5 Avenue Anatole',
        },
      ]);
      mockQueryOverpassMuseums.mockResolvedValue([]);

      const bbox: [number, number, number, number] = [
        PARIS.lng - 0.05,
        PARIS.lat - 0.05,
        PARIS.lng + 0.05,
        PARIS.lat + 0.05,
      ];
      const res = await useCase.execute({ bbox });

      expect(res.museums[0].address).toBe('5 Avenue Anatole');
    });
  });

  describe('OSM-OSM cluster representative pick (L144 / L173 / L177)', () => {
    it('clusters 3 OSM entries with same-similar names and returns 1 representative (kills L144 union-find merge `if (true)`)', async () => {
      mockQueryOverpassMuseums.mockResolvedValue([
        makeOsm({
          name: 'Louvre Museum',
          address: 'short',
          latitude: PARIS.lat,
          longitude: PARIS.lng,
        }),
        makeOsm({
          name: 'Le Louvre',
          address: 'mid length addr',
          latitude: PARIS.lat + 0.0001,
          longitude: PARIS.lng,
        }),
        makeOsm({
          name: 'Louvre',
          address: 'this is the longest address',
          latitude: PARIS.lat + 0.0002,
          longitude: PARIS.lng,
        }),
      ]);

      const res = await useCase.execute({ lat: PARIS.lat, lng: PARIS.lng, radiusMeters: 10_000 });

      expect(res.museums).toHaveLength(1);
    });

    it('picks the entry with the LONGEST address as representative (kills L173 `for (let k = 1; false; …)` + L177 conditional)', async () => {
      mockQueryOverpassMuseums.mockResolvedValue([
        makeOsm({ name: 'A', address: 'short', latitude: PARIS.lat, longitude: PARIS.lng }),
        makeOsm({
          name: 'B',
          address: 'the longest address among the three',
          latitude: PARIS.lat + 0.0001,
          longitude: PARIS.lng,
        }),
        makeOsm({
          name: 'C',
          address: 'mid-length addr',
          latitude: PARIS.lat + 0.0002,
          longitude: PARIS.lng,
        }),
      ]);

      const res = await useCase.execute({ lat: PARIS.lat, lng: PARIS.lng, radiusMeters: 10_000 });

      expect(res.museums).toHaveLength(1);
      expect(res.museums[0].address).toBe('the longest address among the three');
    });

    it('on equal-length addresses falls back to LONGEST NAME (kills L177 `addrLen === bestAddrLen && nameLen > bestNameLen` mutants)', async () => {
      mockQueryOverpassMuseums.mockResolvedValue([
        makeOsm({ name: 'Museum AA', address: 'abcde', latitude: PARIS.lat, longitude: PARIS.lng }),
        makeOsm({
          name: 'Museum AAAA',
          address: 'xyzwq',
          latitude: PARIS.lat + 0.0001,
          longitude: PARIS.lng,
        }),
      ]);

      const res = await useCase.execute({ lat: PARIS.lat, lng: PARIS.lng, radiusMeters: 10_000 });

      expect(res.museums).toHaveLength(1);
      expect(res.museums[0].name).toBe('Museum AAAA');
    });
  });

  describe('OSM-OSM dedup conditional (L152 ConditionalExpression + LogicalOperator)', () => {
    it('merges 2 OSM entries by DISTANCE alone when names differ (kills L152 `false || …`)', async () => {
      mockQueryOverpassMuseums.mockResolvedValue([
        makeOsm({
          name: 'AlphaCenter',
          address: 'short',
          latitude: PARIS.lat,
          longitude: PARIS.lng,
        }),
        makeOsm({
          name: 'BetaGallery',
          address: 'a longer address',
          latitude: PARIS.lat + latOffsetMeters(50),
          longitude: PARIS.lng,
        }),
      ]);

      const res = await useCase.execute({ lat: PARIS.lat, lng: PARIS.lng, radiusMeters: 10_000 });

      expect(res.museums).toHaveLength(1);
    });

    it('keeps 2 OSM entries SEPARATE when distance > 100m AND names differ (kills the `||` → `&&` LogicalOperator mutant on L152)', async () => {
      mockQueryOverpassMuseums.mockResolvedValue([
        makeOsm({
          name: 'AlphaCenter',
          address: 'short',
          latitude: PARIS.lat,
          longitude: PARIS.lng,
        }),
        makeOsm({
          name: 'BetaGallery',
          address: 'something else',
          latitude: PARIS.lat + latOffsetMeters(300),
          longitude: PARIS.lng,
        }),
      ]);

      const res = await useCase.execute({ lat: PARIS.lat, lng: PARIS.lng, radiusMeters: 10_000 });

      expect(res.museums).toHaveLength(2);
    });
  });

  describe('OSM-local dedup thresholds (L212 / L214)', () => {
    it('drops OSM at exactly 100m from local regardless of name (kills `<=` → `<` and `if (false)` on L212)', async () => {
      await seedLocal(repo, [
        { name: 'LocalCenter', slug: 'local', latitude: PARIS.lat, longitude: PARIS.lng },
      ]);
      mockQueryOverpassMuseums.mockResolvedValue([
        makeOsm({
          name: 'CompletelyDifferentName',
          latitude: PARIS.lat + latOffsetMeters(80),
          longitude: PARIS.lng,
        }),
      ]);

      const res = await useCase.execute({ lat: PARIS.lat, lng: PARIS.lng, radiusMeters: 10_000 });

      expect(res.museums).toHaveLength(1);
      expect(res.museums[0].source).toBe('local');
    });

    it('drops OSM at 300m with similar name to local (kills L214 conditional + LogicalOperator)', async () => {
      await seedLocal(repo, [
        { name: 'Musée du Louvre', slug: 'louvre', latitude: PARIS.lat, longitude: PARIS.lng },
      ]);
      mockQueryOverpassMuseums.mockResolvedValue([
        makeOsm({
          name: 'Musee du Louvre',
          latitude: PARIS.lat + latOffsetMeters(300),
          longitude: PARIS.lng,
        }),
      ]);

      const res = await useCase.execute({ lat: PARIS.lat, lng: PARIS.lng, radiusMeters: 10_000 });

      expect(res.museums).toHaveLength(1);
      expect(res.museums[0].source).toBe('local');
    });

    it('keeps OSM at 300m when name DIFFERS (kills L214 `&&` → `||` on a complementary scenario)', async () => {
      await seedLocal(repo, [
        { name: 'Local Museum', slug: 'local', latitude: PARIS.lat, longitude: PARIS.lng },
      ]);
      mockQueryOverpassMuseums.mockResolvedValue([
        makeOsm({
          name: 'CompletelyOtherGallery',
          latitude: PARIS.lat + latOffsetMeters(300),
          longitude: PARIS.lng,
        }),
      ]);

      const res = await useCase.execute({ lat: PARIS.lat, lng: PARIS.lng, radiusMeters: 10_000 });

      expect(res.museums).toHaveLength(2);
    });
  });

  describe('radius inclusive bound (L243)', () => {
    it('includes a local at distance exactly equal to the radius (kills `<=` → `<` on L243)', async () => {
      await seedLocal(repo, [
        {
          name: 'EdgeMuseum',
          slug: 'edge',
          latitude: PARIS.lat + latOffsetMeters(1000),
          longitude: PARIS.lng,
        },
      ]);
      mockQueryOverpassMuseums.mockResolvedValue([]);

      const res = await useCase.execute({ lat: PARIS.lat, lng: PARIS.lng, radiusMeters: 1000 });

      expect(res.museums.map((m) => m.name)).toContain('EdgeMuseum');
    });

    it('excludes a local just beyond the radius (sanity check on the inclusive bound semantics)', async () => {
      await seedLocal(repo, [
        {
          name: 'FarMuseum',
          slug: 'far',
          latitude: PARIS.lat + latOffsetMeters(1100),
          longitude: PARIS.lng,
        },
      ]);
      mockQueryOverpassMuseums.mockResolvedValue([]);

      const res = await useCase.execute({ lat: PARIS.lat, lng: PARIS.lng, radiusMeters: 1000 });

      expect(res.museums).toHaveLength(0);
    });
  });

  describe('q filter + distance sort (L352 / L355)', () => {
    it('q filter keeps only matching entries (kills `(e) => undefined` ArrowFunction)', async () => {
      await seedLocal(repo, [
        { name: 'Louvre', slug: 'louvre', latitude: PARIS.lat, longitude: PARIS.lng },
        { name: 'Orsay', slug: 'orsay', latitude: PARIS.lat + 0.0001, longitude: PARIS.lng },
      ]);
      mockQueryOverpassMuseums.mockResolvedValue([]);

      const res = await useCase.execute({
        lat: PARIS.lat,
        lng: PARIS.lng,
        radiusMeters: 10_000,
        q: 'louvre',
      });

      expect(res.museums.map((m) => m.name)).toEqual(['Louvre']);
    });

    it('result is sorted by ascending distance (kills `() => undefined` sort comparator + MethodExpression sort removal)', async () => {
      await seedLocal(repo, [
        {
          name: 'Far',
          slug: 'far',
          latitude: PARIS.lat + latOffsetMeters(5000),
          longitude: PARIS.lng,
        },
        {
          name: 'Near',
          slug: 'near',
          latitude: PARIS.lat + latOffsetMeters(500),
          longitude: PARIS.lng,
        },
        {
          name: 'Middle',
          slug: 'middle',
          latitude: PARIS.lat + latOffsetMeters(2000),
          longitude: PARIS.lng,
        },
      ]);
      mockQueryOverpassMuseums.mockResolvedValue([]);

      const res = await useCase.execute({ lat: PARIS.lat, lng: PARIS.lng, radiusMeters: 10_000 });

      expect(res.museums.map((m) => m.name)).toEqual(['Near', 'Middle', 'Far']);
      const distances = res.museums.map((m) => m.distance);
      for (let i = 1; i < distances.length; i++) {
        expect(distances[i]).toBeGreaterThanOrEqual(distances[i - 1]);
      }
    });
  });

  describe('geocoding fallback (L365 / L370 / L377)', () => {
    it('geocodes when lat OR lng is null AND q is present (kills L365 `(false || lng == null) && q` mutant)', async () => {
      mockGeocodeWithNominatim.mockResolvedValue({
        lat: PARIS.lat,
        lng: PARIS.lng,
      } as NominatimGeocodingResult);
      mockQueryOverpassMuseums.mockResolvedValue([]);
      await seedLocal(repo, [
        { name: 'Paris Museum', slug: 'gh', latitude: PARIS.lat, longitude: PARIS.lng },
      ]);

      const res = await useCase.execute({ q: 'paris' });

      expect(mockGeocodeWithNominatim).toHaveBeenCalledTimes(1);
      expect(res.museums.map((m) => m.name)).toContain('Paris Museum');
    });

    it('does NOT geocode when q is absent (kills L365 `&&` collapse + `if (true)` mutants)', async () => {
      await seedLocal(repo, [{ name: 'X', slug: 'x', latitude: PARIS.lat, longitude: PARIS.lng }]);

      await useCase.execute({});

      expect(mockGeocodeWithNominatim).not.toHaveBeenCalled();
    });

    it('returns local-only results when lat/lng still null after no q (kills L377 `if (lat == null || false)` mutant)', async () => {
      await seedLocal(repo, [{ name: 'X', slug: 'x', latitude: PARIS.lat, longitude: PARIS.lng }]);

      const res = await useCase.execute({});

      expect(mockQueryOverpassMuseums).not.toHaveBeenCalled();
      expect(res.museums.map((m) => m.name)).toEqual(['X']);
    });

    it('logs the exact "Geocoded text query to coordinates" event with q/lat/lng payload (kills L370 StringLiteral + ObjectLiteral mutants)', async () => {
      mockGeocodeWithNominatim.mockResolvedValue({
        lat: PARIS.lat,
        lng: PARIS.lng,
      } as NominatimGeocodingResult);
      mockQueryOverpassMuseums.mockResolvedValue([]);

      await useCase.execute({ q: 'paris' });

      const geocodedCall = mockLoggerInfo.mock.calls.find(
        (c) => c[0] === 'Geocoded text query to coordinates',
      );
      expect(geocodedCall).toBeDefined();
      expect(geocodedCall![1]).toEqual({
        q: 'paris',
        lat: PARIS.lat,
        lng: PARIS.lng,
      });
    });
  });

  describe('constructor deps normalisation (L306)', () => {
    it('wires a plain CacheService through `{ cache: cacheOrDeps }` (kills `: {}` ObjectLiteral mutant)', async () => {
      const fakeCache = {
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
      } as unknown as CacheService;

      const uc = new SearchMuseumsUseCase(repo, fakeCache);
      mockQueryOverpassMuseums.mockResolvedValue([]);

      await uc.execute({ lat: PARIS.lat, lng: PARIS.lng, radiusMeters: 10_000 });

      expect(mockQueryOverpassMuseums).toHaveBeenCalled();
    });
  });
});
