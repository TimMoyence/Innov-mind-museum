import {
  LocationResolver,
  resolveLocationForMessage,
  type LocationConsentChecker,
} from '@modules/chat/useCase/location-resolver';
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

    // Cycle 1.5 (RE-RED — intentional contract change vs Cycle 1, NFR-1):
    // `location_to_llm` granted now means effective level = `full` → the resolved
    // location carries the NEIGHBOURHOOD field (REQ-6), not merely the coarse city.
    // The mock checker is bi-scope: `location_to_llm` granted dominates (REQ-1).
    it('emits the FULL (neighbourhood) location when location_to_llm is granted (REQ-6, cycle 1.5)', async () => {
      const repo = makeMuseumRepo({
        findAll: jest
          .fn()
          .mockResolvedValue([
            makeMuseum({ id: 1, name: 'Far Museum', latitude: 48.9, longitude: 2.4 }),
          ]),
      });
      mockedReverseGeocode.mockResolvedValue({
        displayName: 'Le Marais, Paris, France',
        address: { neighbourhood: 'Le Marais', suburb: '4e', city: 'Paris', country: 'France' },
      });
      const resolver = new LocationResolver(repo);
      const session = makeSession();
      const consentChecker: LocationConsentChecker = {
        isGranted: jest.fn(async (_userId: number, scope: string) =>
          scope === 'location_to_llm' ? true : false,
        ),
      };

      const result = await resolveLocationForMessage(resolver, 'lat:48.8606,lng:2.3376', session, {
        userId: 42,
        consentChecker,
      });

      expect(result).toBeDefined();
      // Full level → neighbourhood label is exposed (finer than the coarse city).
      expect(result?.consentGranularity).toBe('full');
      expect(result?.reverseGeocodeNeighbourhood).toBe('Le Marais, Paris');
    });

    it('skips the consent gate entirely when no checker is supplied (legacy path → full, D-LEGACY)', async () => {
      const resolver = buildResolver();
      const session = makeSession();

      const result = await resolveLocationForMessage(resolver, 'lat:48.8606,lng:2.3376', session);

      expect(result).toBeDefined();
      // Cycle 1.5 — legacy/no-checker path is treated as `full` (D-LEGACY), so the
      // coarse value is still present AND the granularity is full.
      expect(result?.reverseGeocodeCoarse).toBe('Paris, France');
      expect(result?.consentGranularity).toBe('full');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Cycle 1.5 — neighbourhood composition on resolve() (R1-R6). These prove the
  // NEW `reverseGeocodeNeighbourhood` field + composition rules (REQ-4/4a/4b,
  // D-FIELD `neighbourhood ?? suburb`). They FAIL today (field does not exist).
  // ─────────────────────────────────────────────────────────────────────────
  describe('reverseGeocodeNeighbourhood field (cycle 1.5, R1-R6)', () => {
    const outdoorRepo = (): ReturnType<typeof makeMuseumRepo> =>
      makeMuseumRepo({
        findAll: jest
          .fn()
          .mockResolvedValue([
            makeMuseum({ id: 1, name: 'Far Museum', latitude: 48.9, longitude: 2.4 }),
          ]),
      });

    it('R1: neighbourhood + city, excludes road (priority neighbourhood)', async () => {
      mockedReverseGeocode.mockResolvedValue({
        displayName: 'Le Marais, Paris, France',
        address: {
          neighbourhood: 'Le Marais',
          suburb: '4e',
          city: 'Paris',
          country: 'France',
          road: 'Rue X',
        },
      });
      const resolver = new LocationResolver(outdoorRepo());

      const result = await resolver.resolve(48.8606, 2.3376);

      expect(result.reverseGeocodeNeighbourhood).toBe('Le Marais, Paris');
      expect(result.reverseGeocodeNeighbourhood).not.toContain('Rue X');
    });

    it('R2: falls back to suburb when neighbourhood absent', async () => {
      mockedReverseGeocode.mockResolvedValue({
        displayName: 'Montmartre, Paris, France',
        address: { suburb: 'Montmartre', city: 'Paris', country: 'France' },
      });
      const resolver = new LocationResolver(outdoorRepo());

      const result = await resolver.resolve(48.886, 2.343);

      expect(result.reverseGeocodeNeighbourhood).toBe('Montmartre, Paris');
    });

    it('R3: degrades to city when neither neighbourhood nor suburb available (REQ-4a, no dangling comma)', async () => {
      mockedReverseGeocode.mockResolvedValue({
        displayName: 'Bordeaux, France',
        address: { city: 'Bordeaux', country: 'France' },
      });
      const resolver = new LocationResolver(outdoorRepo());

      const result = await resolver.resolve(44.8378, -0.5792);

      // REQ-4a: a full-consent user never gets LESS than coarse — falls back to
      // the city-level composition (== coarse), never a dangling ", ".
      expect(result.reverseGeocodeNeighbourhood).toBe('Bordeaux, France');
      expect(result.reverseGeocodeNeighbourhood).not.toMatch(/,\s*$/);
      expect(result.reverseGeocodeNeighbourhood).not.toMatch(/^\s*,/);
    });

    it('R4: null when reverse-geocode fails (both coarse and neighbourhood null)', async () => {
      mockedReverseGeocode.mockResolvedValue(null);
      const resolver = new LocationResolver(outdoorRepo());

      const result = await resolver.resolve(48.86, 2.33);

      expect(result.reverseGeocode).toBeNull();
      expect(result.reverseGeocodeCoarse).toBeNull();
      expect(result.reverseGeocodeNeighbourhood).toBeNull();
    });

    it('R5: null neighbourhood when inside a museum (location already disclosed by museum id)', async () => {
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
      expect(result.reverseGeocodeNeighbourhood).toBeNull();
      expect(result.reverseGeocodeCoarse).toBeNull();
    });

    it('R6: fine analytics value keeps street+suburb+city, distinct from coarse and neighbourhood (non-regression)', async () => {
      mockedReverseGeocode.mockResolvedValue({
        displayName: '12 Rue de Rivoli, 75001 Paris, France',
        address: {
          road: 'Rue de Rivoli',
          neighbourhood: 'Le Marais',
          suburb: 'Paris Centre',
          city: 'Paris',
          country: 'France',
        },
        name: 'Fontaine de la Victoire',
      });
      const resolver = new LocationResolver(outdoorRepo());

      const result = await resolver.resolve(48.8606, 2.3376);

      expect(result.reverseGeocode).toContain('Rue de Rivoli');
      expect(result.reverseGeocodeNeighbourhood).toBe('Le Marais, Paris');
      expect(result.reverseGeocodeCoarse).toBe('Paris, France');
      // The three values are intentionally distinct granularities.
      expect(result.reverseGeocode).not.toBe(result.reverseGeocodeNeighbourhood);
      expect(result.reverseGeocodeNeighbourhood).not.toBe(result.reverseGeocodeCoarse);
      // Neighbourhood NEVER leaks the road / house number.
      expect(result.reverseGeocodeNeighbourhood).not.toContain('Rue de Rivoli');
      expect(result.reverseGeocodeNeighbourhood).not.toMatch(/\d/);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Cycle 1.5 — effective consent level on resolveLocationForMessage (C1-C5,
  // C-err). 2-scope evaluation → {none|coarse|full}; full dominates (REQ-1);
  // single Nominatim call (NFR-5); fail-closed `none` on checker error (NFR-6).
  // ─────────────────────────────────────────────────────────────────────────
  describe('effective consent level on resolveLocationForMessage (cycle 1.5, C1-C5/C-err)', () => {
    const buildOutdoorResolver = (): LocationResolver => {
      const repo = makeMuseumRepo({
        findAll: jest
          .fn()
          .mockResolvedValue([
            makeMuseum({ id: 1, name: 'Far Museum', latitude: 48.9, longitude: 2.4 }),
          ]),
      });
      mockedReverseGeocode.mockResolvedValue({
        displayName: 'Le Marais, Paris, France',
        address: { neighbourhood: 'Le Marais', city: 'Paris', country: 'France' },
      });
      return new LocationResolver(repo);
    };

    const biScopeChecker = (
      grants: Partial<Record<'location_to_llm' | 'location_coarse_to_llm', boolean>>,
    ): LocationConsentChecker => ({
      isGranted: jest.fn(async (_userId: number, scope: string) =>
        Boolean(grants[scope as 'location_to_llm' | 'location_coarse_to_llm']),
      ),
    });

    it('C1: location_to_llm granted → level full, Nominatim called once', async () => {
      const resolver = buildOutdoorResolver();
      const session = makeSession();
      const checker = biScopeChecker({ location_to_llm: true });

      const result = await resolveLocationForMessage(resolver, 'lat:48.8606,lng:2.3376', session, {
        userId: 42,
        consentChecker: checker,
      });

      expect(result).toBeDefined();
      expect(result?.consentGranularity).toBe('full');
      expect(result?.reverseGeocodeNeighbourhood).toBe('Le Marais, Paris');
      expect(mockedReverseGeocode).toHaveBeenCalledTimes(1);
    });

    it('C2: location_to_llm refused but location_coarse_to_llm granted → level coarse, Nominatim called once', async () => {
      const resolver = buildOutdoorResolver();
      const session = makeSession();
      const checker = biScopeChecker({ location_to_llm: false, location_coarse_to_llm: true });

      const result = await resolveLocationForMessage(resolver, 'lat:48.8606,lng:2.3376', session, {
        userId: 42,
        consentChecker: checker,
      });

      expect(result).toBeDefined();
      expect(result?.consentGranularity).toBe('coarse');
      // Coarse still carries the city value; the builder will pick coarse over hood.
      expect(result?.reverseGeocodeCoarse).toBe('Paris, France');
      expect(mockedReverseGeocode).toHaveBeenCalledTimes(1);
    });

    it('C3: both scopes refused → undefined, Nominatim NOT called (REQ-1 none)', async () => {
      const resolver = buildOutdoorResolver();
      const session = makeSession();
      const checker = biScopeChecker({ location_to_llm: false, location_coarse_to_llm: false });

      const result = await resolveLocationForMessage(resolver, 'lat:48.8606,lng:2.3376', session, {
        userId: 42,
        consentChecker: checker,
      });

      expect(result).toBeUndefined();
      expect(mockedReverseGeocode).not.toHaveBeenCalled();
    });

    it('C4: anonymous (no userId) → undefined, checker NOT called (REQ-2)', async () => {
      const resolver = buildOutdoorResolver();
      const session = makeSession();
      const checker = biScopeChecker({ location_to_llm: true });

      const result = await resolveLocationForMessage(resolver, 'lat:48.8606,lng:2.3376', session, {
        consentChecker: checker,
      });

      expect(result).toBeUndefined();
      expect(checker.isGranted).not.toHaveBeenCalled();
      expect(mockedReverseGeocode).not.toHaveBeenCalled();
    });

    it('C5: full granted short-circuits the coarse check → location_coarse_to_llm never queried (NFR-5/perf)', async () => {
      const resolver = buildOutdoorResolver();
      const session = makeSession();
      const checker = biScopeChecker({ location_to_llm: true, location_coarse_to_llm: true });

      await resolveLocationForMessage(resolver, 'lat:48.8606,lng:2.3376', session, {
        userId: 42,
        consentChecker: checker,
      });

      // full dominates → no need to query the coarse scope (REQ-1 short-circuit).
      expect(checker.isGranted).not.toHaveBeenCalledWith(42, 'location_coarse_to_llm');
      // And a single reverse-geocode regardless of level (one network call).
      expect(mockedReverseGeocode).toHaveBeenCalledTimes(1);
    });

    it('C-err: checker throws → fail-closed `none`, undefined emitted, no Nominatim call (NFR-6, D-FAILMODE)', async () => {
      const resolver = buildOutdoorResolver();
      const session = makeSession();
      const checker: LocationConsentChecker = {
        isGranted: jest.fn().mockRejectedValue(new Error('consent store down')),
      };

      const result = await resolveLocationForMessage(resolver, 'lat:48.8606,lng:2.3376', session, {
        userId: 42,
        consentChecker: checker,
      });

      // Fail-closed: an error in the checker must NOT leak a location (vs Cycle 1
      // which propagated the exception). No location, no external call.
      expect(result).toBeUndefined();
      expect(mockedReverseGeocode).not.toHaveBeenCalled();
    });
  });
});
