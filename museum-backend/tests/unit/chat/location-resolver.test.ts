import { LocationResolver } from '@modules/chat/useCase/location-resolver';
import * as nominatimClient from '@shared/http/nominatim.client';

import { makeMuseum, makeMuseumRepo } from '../../helpers/museum/museum.fixtures';
import { makeCache } from '../../helpers/chat/cache.fixtures';

// Suppress logger output during tests
jest.mock('@shared/logger/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Mock the reverse geocoder
jest.mock('@shared/http/nominatim.client', () => ({
  ...jest.requireActual('@shared/http/nominatim.client'),
  reverseGeocodeWithNominatim: jest.fn(),
}));

const mockedReverseGeocode = nominatimClient.reverseGeocodeWithNominatim as jest.MockedFunction<
  typeof nominatimClient.reverseGeocodeWithNominatim
>;

describe('LocationResolver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedReverseGeocode.mockResolvedValue(null);
  });

  describe('isInsideMuseum = true (< 200m)', () => {
    it('returns isInsideMuseum=true when nearest museum is within 200m', async () => {
      const repo = makeMuseumRepo({
        findAll: jest.fn().mockResolvedValue([
          // Museum very close (~11m away)
          makeMuseum({ id: 1, name: 'Louvre', latitude: 48.8607, longitude: 2.3376 }),
        ]),
      });
      const resolver = new LocationResolver(repo);

      const result = await resolver.resolve(48.8606, 2.3376);

      expect(result.isInsideMuseum).toBe(true);
      expect(result.nearbyMuseums).toHaveLength(1);
      expect(result.nearbyMuseums[0].name).toBe('Louvre');
      expect(result.nearestMuseumDistance).toBeLessThan(200);
      expect(result.reverseGeocode).toBeNull();
    });

    it('does not call reverse geocode when inside a museum', async () => {
      const repo = makeMuseumRepo({
        findAll: jest
          .fn()
          .mockResolvedValue([
            makeMuseum({ id: 1, name: 'Louvre', latitude: 48.8607, longitude: 2.3376 }),
          ]),
      });
      const resolver = new LocationResolver(repo);

      await resolver.resolve(48.8606, 2.3376);

      expect(mockedReverseGeocode).not.toHaveBeenCalled();
    });

    it('caches the result for 20 minutes when inside a museum', async () => {
      const repo = makeMuseumRepo({
        findAll: jest
          .fn()
          .mockResolvedValue([
            makeMuseum({ id: 1, name: 'Louvre', latitude: 48.8607, longitude: 2.3376 }),
          ]),
      });
      const cache = makeCache();
      const resolver = new LocationResolver(repo, cache);

      await resolver.resolve(48.8606, 2.3376);

      expect(cache.set).toHaveBeenCalledTimes(1);
      const [, , ttl] = cache.set.mock.calls[0];
      expect(ttl).toBe(20 * 60); // 20 minutes
    });

    it('returns cached result on cache hit', async () => {
      const cachedResult = {
        nearbyMuseums: [{ name: 'Cached Museum', distance: 50 }],
        nearestMuseumDistance: 50,
        reverseGeocode: null,
        isInsideMuseum: true,
      };
      const cache = makeCache({
        get: jest.fn().mockResolvedValue(cachedResult),
      });
      const repo = makeMuseumRepo();
      const resolver = new LocationResolver(repo, cache);

      const result = await resolver.resolve(48.8606, 2.3376);

      expect(result).toBe(cachedResult);
      expect(repo.findAll).not.toHaveBeenCalled();
    });
  });

  describe('isInsideMuseum = false (> 200m)', () => {
    it('calls reverse geocode when outside museum range', async () => {
      const repo = makeMuseumRepo({
        findAll: jest.fn().mockResolvedValue([
          // Museum ~5km away
          makeMuseum({ id: 1, name: 'Far Museum', latitude: 48.9, longitude: 2.4 }),
        ]),
      });
      mockedReverseGeocode.mockResolvedValue({
        displayName: 'Rue de Rivoli, Paris, France',
        address: {
          road: 'Rue de Rivoli',
          suburb: 'Paris Centre',
          city: 'Paris',
          country: 'France',
        },
        name: 'Fontaine de la Victoire',
      });
      const resolver = new LocationResolver(repo);

      const result = await resolver.resolve(48.8606, 2.3376);

      expect(result.isInsideMuseum).toBe(false);
      expect(result.reverseGeocode).toContain('Fontaine de la Victoire');
      expect(result.reverseGeocode).toContain('Rue de Rivoli');
      expect(result.reverseGeocode).toContain('Paris');
      expect(mockedReverseGeocode).toHaveBeenCalledWith(48.8606, 2.3376, 3000);
    });

    it('does NOT cache when user is outside a museum', async () => {
      const repo = makeMuseumRepo({
        findAll: jest
          .fn()
          .mockResolvedValue([
            makeMuseum({ id: 1, name: 'Far Museum', latitude: 48.9, longitude: 2.4 }),
          ]),
      });
      const cache = makeCache();
      const resolver = new LocationResolver(repo, cache);

      await resolver.resolve(48.8606, 2.3376);

      expect(cache.set).not.toHaveBeenCalled();
    });

    it('returns null reverseGeocode gracefully when Nominatim fails', async () => {
      const repo = makeMuseumRepo({
        findAll: jest
          .fn()
          .mockResolvedValue([
            makeMuseum({ id: 1, name: 'Far Museum', latitude: 48.9, longitude: 2.4 }),
          ]),
      });
      mockedReverseGeocode.mockResolvedValue(null);
      const resolver = new LocationResolver(repo);

      const result = await resolver.resolve(48.8606, 2.3376);

      expect(result.isInsideMuseum).toBe(false);
      expect(result.reverseGeocode).toBeNull();
      expect(result.nearbyMuseums).toHaveLength(1);
    });

    it('builds concise location string without duplicate name', async () => {
      const repo = makeMuseumRepo({
        findAll: jest.fn().mockResolvedValue([]),
      });
      mockedReverseGeocode.mockResolvedValue({
        displayName: 'Arc de Triomphe, Place Charles de Gaulle, Paris, France',
        address: {
          road: 'Place Charles de Gaulle',
          city: 'Paris',
          country: 'France',
        },
        name: 'Arc de Triomphe',
      });
      const resolver = new LocationResolver(repo);

      const result = await resolver.resolve(48.8738, 2.295);

      expect(result.reverseGeocode).toBe('Arc de Triomphe, Place Charles de Gaulle, Paris, France');
    });

    it('deduplicates name and road when they match', async () => {
      const repo = makeMuseumRepo({
        findAll: jest.fn().mockResolvedValue([]),
      });
      mockedReverseGeocode.mockResolvedValue({
        displayName: 'Rue de Rivoli, Paris, France',
        address: {
          road: 'Rue de Rivoli',
          city: 'Paris',
          country: 'France',
        },
        name: 'Rue de Rivoli',
      });
      const resolver = new LocationResolver(repo);

      const result = await resolver.resolve(48.8606, 2.3376);

      // name === road, so road is skipped to avoid duplication
      expect(result.reverseGeocode).toBe('Rue de Rivoli, Paris, France');
    });
  });

  describe('no nearby museums', () => {
    it('returns empty nearbyMuseums and null nearestMuseumDistance', async () => {
      const repo = makeMuseumRepo({
        findAll: jest.fn().mockResolvedValue([]),
      });
      const resolver = new LocationResolver(repo);

      const result = await resolver.resolve(48.8606, 2.3376);

      expect(result.nearbyMuseums).toHaveLength(0);
      expect(result.nearestMuseumDistance).toBeNull();
      expect(result.isInsideMuseum).toBe(false);
    });
  });
});
