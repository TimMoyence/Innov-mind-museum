import {
  LocationResolver,
  resolveLocationForMessage,
  type LocationConsentChecker,
} from '@modules/chat/useCase/location/location-resolver';
import * as nominatimClient from '@shared/http/nominatim.client';

import { makeMuseum, makeMuseumRepo } from '../../helpers/museum/museum.fixtures';
import { makeSession } from '../../helpers/chat/message.fixtures';

// Suppress logger output during tests
jest.mock('@shared/logger/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Mock the raw reverse-geocode client (tests run with no CacheService, so the
// resolver falls back to the raw client per its constructor wiring).
jest.mock('@shared/http/nominatim.client', () => ({
  ...jest.requireActual('@shared/http/nominatim.client'),
  reverseGeocodeWithNominatim: jest.fn(),
}));

const mockedReverseGeocode = nominatimClient.reverseGeocodeWithNominatim as jest.MockedFunction<
  typeof nominatimClient.reverseGeocodeWithNominatim
>;

/**
 * Tests the GDPR hardening of {@link LocationResolver} + {@link resolveLocationForMessage}:
 *   1. The resolver exposes a coarse reverse-geocode (city + country only)
 *      that strips street-level PII before reaching the LLM prompt.
 *   2. The fine-grained value is still computed (internal analytics) but
 *      never bundled with street / house-number / postcode details.
 *   3. `resolveLocationForMessage` enforces the `location_to_llm` consent
 *      scope when a consent checker is supplied — no consent → no location
 *      at all, not even the coarse form.
 */
describe('LocationResolver — GDPR coarse mode + consent gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedReverseGeocode.mockResolvedValue(null);
  });

  describe('reverseGeocodeCoarse field', () => {
    it('exposes ONLY city + country in reverseGeocodeCoarse', async () => {
      const repo = makeMuseumRepo({
        findAll: jest.fn().mockResolvedValue([
          // Museum ~5km away → outside-museum path is taken
          makeMuseum({ id: 1, name: 'Far Museum', latitude: 48.9, longitude: 2.4 }),
        ]),
      });
      mockedReverseGeocode.mockResolvedValue({
        displayName: '12 Rue de Rivoli, 75001 Paris, France',
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

      expect(result.reverseGeocodeCoarse).toBe('Paris, France');
      // Sanity: sensitive fields (road, house number, postcode, suburb, POI
      // name) must NOT appear in the coarse value emitted to the LLM.
      expect(result.reverseGeocodeCoarse).not.toContain('Rue de Rivoli');
      expect(result.reverseGeocodeCoarse).not.toContain('Fontaine');
      expect(result.reverseGeocodeCoarse).not.toContain('Paris Centre');
      expect(result.reverseGeocodeCoarse).not.toMatch(/\d/);
    });

    it('keeps the fine-grained value available for internal analytics', async () => {
      const repo = makeMuseumRepo({
        findAll: jest.fn().mockResolvedValue([]),
      });
      mockedReverseGeocode.mockResolvedValue({
        displayName: '12 Rue de Rivoli, 75001 Paris, France',
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

      // Fine value retains street-level context (internal only).
      expect(result.reverseGeocode).toContain('Rue de Rivoli');
      expect(result.reverseGeocode).toContain('Paris');
      // The two values are intentionally distinct.
      expect(result.reverseGeocode).not.toBe(result.reverseGeocodeCoarse);
    });

    it('falls back to locality (suburb / name) + country when city is missing', async () => {
      const repo = makeMuseumRepo({ findAll: jest.fn().mockResolvedValue([]) });
      mockedReverseGeocode.mockResolvedValue({
        displayName: 'Montmartre, France',
        address: {
          road: 'Rue Lepic',
          suburb: 'Montmartre',
          country: 'France',
        },
        name: 'Place du Tertre',
      });
      const resolver = new LocationResolver(repo);

      const result = await resolver.resolve(48.886, 2.343);

      // City missing → use suburb as locality.
      expect(result.reverseGeocodeCoarse).toBe('Montmartre, France');
    });

    it('returns null coarse value when reverse-geocode fails', async () => {
      const repo = makeMuseumRepo({ findAll: jest.fn().mockResolvedValue([]) });
      mockedReverseGeocode.mockResolvedValue(null);
      const resolver = new LocationResolver(repo);

      const result = await resolver.resolve(48.86, 2.33);

      expect(result.reverseGeocode).toBeNull();
      expect(result.reverseGeocodeCoarse).toBeNull();
    });

    it('returns null coarse value when inside a museum (location already disclosed by museum id)', async () => {
      const repo = makeMuseumRepo({
        findAll: jest
          .fn()
          .mockResolvedValue([
            makeMuseum({ id: 1, name: 'Louvre', latitude: 48.8607, longitude: 2.3376 }),
          ]),
      });
      const resolver = new LocationResolver(repo);

      const result = await resolver.resolve(48.8606, 2.3376);

      expect(result.isInsideMuseum).toBe(true);
      expect(result.reverseGeocodeCoarse).toBeNull();
    });
  });

  describe('GDPR consent gate on resolveLocationForMessage', () => {
    const buildResolver = (): LocationResolver => {
      const repo = makeMuseumRepo({
        findAll: jest
          .fn()
          .mockResolvedValue([
            makeMuseum({ id: 1, name: 'Far Museum', latitude: 48.9, longitude: 2.4 }),
          ]),
      });
      mockedReverseGeocode.mockResolvedValue({
        displayName: 'Paris, France',
        address: { city: 'Paris', country: 'France' },
      });
      return new LocationResolver(repo);
    };

    it('emits NO location when the user has not granted location_to_llm', async () => {
      const resolver = buildResolver();
      const session = makeSession();
      const consentChecker: LocationConsentChecker = {
        isGranted: jest.fn().mockResolvedValue(false),
      };

      const result = await resolveLocationForMessage(resolver, 'lat:48.8606,lng:2.3376', session, {
        userId: 42,
        consentChecker,
      });

      expect(result).toBeUndefined();
      // External Nominatim call MUST NOT happen when consent is missing.
      expect(mockedReverseGeocode).not.toHaveBeenCalled();
      expect(consentChecker.isGranted).toHaveBeenCalledWith(42, 'location_to_llm');
    });

    it('emits NO location when user is anonymous (no userId) even with checker present', async () => {
      const resolver = buildResolver();
      const session = makeSession();
      const consentChecker: LocationConsentChecker = {
        isGranted: jest.fn().mockResolvedValue(true),
      };

      const result = await resolveLocationForMessage(resolver, 'lat:48.8606,lng:2.3376', session, {
        consentChecker,
      });

      expect(result).toBeUndefined();
      expect(consentChecker.isGranted).not.toHaveBeenCalled();
    });

    it('emits the coarse location when consent is granted', async () => {
      const resolver = buildResolver();
      const session = makeSession();
      const consentChecker: LocationConsentChecker = {
        isGranted: jest.fn().mockResolvedValue(true),
      };

      const result = await resolveLocationForMessage(resolver, 'lat:48.8606,lng:2.3376', session, {
        userId: 42,
        consentChecker,
      });

      expect(result).toBeDefined();
      expect(result?.reverseGeocodeCoarse).toBe('Paris, France');
    });

    it('skips the consent gate entirely when no checker is supplied (legacy path)', async () => {
      const resolver = buildResolver();
      const session = makeSession();

      const result = await resolveLocationForMessage(resolver, 'lat:48.8606,lng:2.3376', session);

      expect(result).toBeDefined();
      expect(result?.reverseGeocodeCoarse).toBe('Paris, France');
    });
  });
});
