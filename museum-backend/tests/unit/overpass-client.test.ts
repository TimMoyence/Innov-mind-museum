import { queryOverpassMuseums, queryOverpassOpeningHours } from '@shared/http/overpass.client';

jest.mock('@shared/logger/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { logger: mockedLogger } = require('@shared/logger/logger') as {
  logger: { warn: jest.Mock; info: jest.Mock; error: jest.Mock };
};

let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  fetchSpy = jest.spyOn(globalThis, 'fetch');
  mockedLogger.warn.mockClear();
  mockedLogger.info.mockClear();
  mockedLogger.error.mockClear();
});

afterEach(() => {
  fetchSpy.mockRestore();
});

const makeOverpassResponse = (
  elements: {
    type: 'node' | 'way' | 'relation';
    id: number;
    lat?: number;
    lon?: number;
    center?: { lat: number; lon: number };
    tags?: Record<string, string>;
  }[],
) => ({ elements });

describe('queryOverpassMuseums', () => {
  it('parses nodes, ways, and relations from Overpass response', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () =>
        makeOverpassResponse([
          {
            type: 'node',
            id: 1,
            lat: 48.8606,
            lon: 2.3376,
            tags: {
              name: 'Louvre Museum',
              tourism: 'museum',
              'addr:street': 'Rue de Rivoli',
              'addr:housenumber': '1',
              'addr:city': 'Paris',
            },
          },
          {
            type: 'way',
            id: 2,
            center: { lat: 48.8599, lon: 2.3266 },
            tags: {
              name: "Musee d'Orsay",
              tourism: 'museum',
              'addr:city': 'Paris',
            },
          },
          {
            type: 'relation',
            id: 3,
            center: { lat: 48.8611, lon: 2.2877 },
            tags: { name: 'Palais de Tokyo', tourism: 'museum' },
          },
        ]),
    });

    const results = await queryOverpassMuseums({ lat: 48.86, lng: 2.34, radiusMeters: 5000 });

    expect(results).toHaveLength(3);

    expect(results[0]).toEqual({
      name: 'Louvre Museum',
      address: '1 Rue de Rivoli, Paris',
      latitude: 48.8606,
      longitude: 2.3376,
      osmId: 1,
      museumType: 'general',
    });

    expect(results[1]).toEqual({
      name: "Musee d'Orsay",
      address: 'Paris',
      latitude: 48.8599,
      longitude: 2.3266,
      osmId: 2,
      museumType: 'general',
    });

    expect(results[2]).toEqual({
      name: 'Palais de Tokyo',
      address: null,
      latitude: 48.8611,
      longitude: 2.2877,
      osmId: 3,
      museumType: 'general',
    });
  });

  it('returns empty array for empty response', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => makeOverpassResponse([]),
    });

    const results = await queryOverpassMuseums({ lat: 48.86, lng: 2.34, radiusMeters: 5000 });

    expect(results).toEqual([]);
  });

  it('returns empty array when all endpoints fail with network error', async () => {
    // Both main + Kumi mirror fail
    fetchSpy.mockRejectedValue(new Error('Network failure'));

    const results = await queryOverpassMuseums({ lat: 48.86, lng: 2.34, radiusMeters: 5000 });

    expect(results).toEqual([]);
    expect(fetchSpy).toHaveBeenCalledTimes(3); // main + kumi + private.coffee
  });

  it('returns empty array when all endpoints time out', async () => {
    fetchSpy.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          setTimeout(() => {
            reject(new DOMException('The operation was aborted', 'AbortError'));
          }, 5);
        }),
    );

    const results = await queryOverpassMuseums(
      { lat: 48.86, lng: 2.34, radiusMeters: 5000 },
      10, // very short timeout
    );

    expect(results).toEqual([]);
  });

  it('falls back to second endpoint when first returns non-OK', async () => {
    // Main instance 504, Kumi returns data
    fetchSpy
      .mockResolvedValueOnce({ ok: false, status: 504, statusText: 'Gateway Timeout' })
      .mockResolvedValueOnce({
        ok: true,
        json: async () =>
          makeOverpassResponse([
            {
              type: 'node',
              id: 42,
              lat: 48.86,
              lon: 2.34,
              tags: { name: 'Fallback Museum' },
            },
          ]),
      });

    const results = await queryOverpassMuseums({ lat: 48.86, lng: 2.34, radiusMeters: 5000 });

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Fallback Museum');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('filters results by q parameter (case-insensitive)', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () =>
        makeOverpassResponse([
          {
            type: 'node',
            id: 1,
            lat: 48.86,
            lon: 2.34,
            tags: { name: 'Louvre Museum' },
          },
          {
            type: 'node',
            id: 2,
            lat: 48.85,
            lon: 2.33,
            tags: { name: "Musee d'Orsay" },
          },
          {
            type: 'node',
            id: 3,
            lat: 48.87,
            lon: 2.29,
            tags: { name: 'Palais de Tokyo' },
          },
        ]),
    });

    const results = await queryOverpassMuseums({
      lat: 48.86,
      lng: 2.34,
      radiusMeters: 5000,
      q: 'louvre',
    });

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Louvre Museum');
  });

  it('skips elements without a name tag', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () =>
        makeOverpassResponse([
          {
            type: 'node',
            id: 1,
            lat: 48.86,
            lon: 2.34,
            tags: { tourism: 'museum' },
          },
          {
            type: 'node',
            id: 2,
            lat: 48.85,
            lon: 2.33,
            tags: { name: 'Named Museum', tourism: 'museum' },
          },
          {
            type: 'node',
            id: 3,
            lat: 48.87,
            lon: 2.29,
            // no tags at all
          },
        ]),
    });

    const results = await queryOverpassMuseums({ lat: 48.86, lng: 2.34, radiusMeters: 5000 });

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Named Museum');
  });

  it('returns empty array when all endpoints return non-OK HTTP status', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 429, statusText: 'Too Many Requests' });

    const results = await queryOverpassMuseums({ lat: 48.86, lng: 2.34, radiusMeters: 5000 });

    expect(results).toEqual([]);
  });

  it('returns empty array when all endpoints return unexpected response shape', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ unexpected: 'shape' }),
    });

    const results = await queryOverpassMuseums({ lat: 48.86, lng: 2.34, radiusMeters: 5000 });

    expect(results).toEqual([]);
  });

  it('formats address with street + housenumber + city', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () =>
        makeOverpassResponse([
          {
            type: 'node',
            id: 1,
            lat: 48.86,
            lon: 2.34,
            tags: {
              name: 'Test Museum',
              'addr:street': 'Main Street',
              'addr:housenumber': '42',
              'addr:city': 'Paris',
            },
          },
        ]),
    });

    const results = await queryOverpassMuseums({ lat: 48.86, lng: 2.34, radiusMeters: 5000 });

    expect(results[0].address).toBe('42 Main Street, Paris');
  });

  it('extracts optional metadata tags (opening_hours, website, phone, image, description, wheelchair)', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () =>
        makeOverpassResponse([
          {
            type: 'node',
            id: 100,
            lat: 48.86,
            lon: 2.34,
            tags: {
              name: 'Rich Museum',
              opening_hours: 'Tu-Su 10:00-18:00',
              website: 'https://example.org',
              phone: '+33 1 23 45 67 89',
              image: 'https://cdn.example.org/img.jpg',
              description: 'A grand museum.',
              wheelchair: 'yes',
            },
          },
        ]),
    });

    const results = await queryOverpassMuseums({ lat: 48.86, lng: 2.34, radiusMeters: 5000 });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      name: 'Rich Museum',
      openingHours: 'Tu-Su 10:00-18:00',
      website: 'https://example.org',
      phone: '+33 1 23 45 67 89',
      imageUrl: 'https://cdn.example.org/img.jpg',
      description: 'A grand museum.',
      wheelchair: 'yes',
    });
  });

  it('falls back to contact:website / contact:phone when primary tags absent', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () =>
        makeOverpassResponse([
          {
            type: 'node',
            id: 101,
            lat: 48.86,
            lon: 2.34,
            tags: {
              name: 'Contact Museum',
              'contact:website': 'https://contact.example.org',
              'contact:phone': '+33 9 99 99 99 99',
            },
          },
        ]),
    });

    const results = await queryOverpassMuseums({ lat: 48.86, lng: 2.34, radiusMeters: 5000 });

    expect(results[0].website).toBe('https://contact.example.org');
    expect(results[0].phone).toBe('+33 9 99 99 99 99');
  });

  it('prefers a localized description tag over the bare description', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () =>
        makeOverpassResponse([
          {
            type: 'node',
            id: 102,
            lat: 48.86,
            lon: 2.34,
            tags: {
              name: 'Loc Museum',
              description: 'Bare description',
              'description:fr': 'Description française',
            },
          },
        ]),
    });

    const results = await queryOverpassMuseums({ lat: 48.86, lng: 2.34, radiusMeters: 5000 });

    expect(results[0].description).toBe('Description française');
  });

  it('formats address with street only (no housenumber)', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () =>
        makeOverpassResponse([
          {
            type: 'node',
            id: 1,
            lat: 48.86,
            lon: 2.34,
            tags: { name: 'Test', 'addr:street': 'Main Street' },
          },
        ]),
    });

    const results = await queryOverpassMuseums({ lat: 48.86, lng: 2.34, radiusMeters: 5000 });

    expect(results[0].address).toBe('Main Street');
  });

  describe('bbox branch + missing-params guard', () => {
    it('routes the bbox path and returns parsed museums when bbox is provided', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          makeOverpassResponse([
            {
              type: 'node',
              id: 7,
              lat: 38.72,
              lon: -9.15,
              tags: { name: 'Bbox Museum', tourism: 'museum' },
            },
          ]),
      });

      const results = await queryOverpassMuseums({ bbox: [-9.18, 38.69, -9.1, 38.75] });

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        name: 'Bbox Museum',
        address: null,
        latitude: 38.72,
        longitude: -9.15,
        osmId: 7,
        museumType: 'general',
      });

      // Verify the body POSTed to Overpass contains the bbox filter, not the radius filter.
      const firstCallArgs = fetchSpy.mock.calls[0] as [string, RequestInit];
      const body = (firstCallArgs[1].body as string) ?? '';
      const decoded = decodeURIComponent(body);
      expect(decoded).toContain('38.69,-9.18,38.75,-9.1');
      expect(decoded).not.toContain('around:');
    });

    it('returns [] without hitting fetch when called without bbox and without full lat/lng/radius', async () => {
      const results = await queryOverpassMuseums({});

      expect(results).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(mockedLogger.warn).toHaveBeenCalledWith(
        'queryOverpassMuseums called without bbox or center+radius — skipping',
      );
    });

    it('returns [] when lat is set but lng is missing (partial center, no bbox)', async () => {
      const results = await queryOverpassMuseums({ lat: 48.86, radiusMeters: 5000 });

      expect(results).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns [] when lat+lng are set but radiusMeters is missing (no bbox)', async () => {
      const results = await queryOverpassMuseums({ lat: 48.86, lng: 2.34 });

      expect(results).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('logs the endpoint + error context when a fetch throws and walks the chain', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('boom-main')).mockResolvedValueOnce({
        ok: true,
        json: async () =>
          makeOverpassResponse([
            {
              type: 'node',
              id: 9,
              lat: 48.86,
              lon: 2.34,
              tags: { name: 'Recovered Museum' },
            },
          ]),
      });

      const results = await queryOverpassMuseums({ lat: 48.86, lng: 2.34, radiusMeters: 5000 });

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Recovered Museum');

      // The catch-branch warn must include the exact message string + full context shape.
      expect(mockedLogger.warn).toHaveBeenCalledWith(
        'Overpass endpoint query failed — trying next',
        expect.objectContaining({
          endpoint: expect.stringContaining('overpass-api.de'),
          error: 'boom-main',
          lat: 48.86,
          lng: 2.34,
          radiusMeters: 5000,
          bbox: undefined,
        }),
      );
    });

    it('stringifies non-Error throwables in the catch-branch warn context', async () => {
      // First two endpoints reject with non-Error values, third succeeds — exercises the
      // `error instanceof Error ? msg : String(error)` ternary in the catch branch.
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- non-Error rejection IS the behavior under test (ternary false branch / String(error) fallback)
      fetchSpy.mockReturnValueOnce(Promise.reject('string-error'));
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- non-Error rejection IS the behavior under test (ternary false branch / String(error) fallback)
      fetchSpy.mockReturnValueOnce(Promise.reject({ weird: 'object' }));
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => makeOverpassResponse([]),
      });

      const results = await queryOverpassMuseums({
        bbox: [-9.18, 38.69, -9.1, 38.75],
      });

      expect(results).toEqual([]);
      const warnCalls = mockedLogger.warn.mock.calls.filter(
        ([msg]) => msg === 'Overpass endpoint query failed — trying next',
      );
      expect(warnCalls).toHaveLength(2);
      expect(warnCalls[0]?.[1]).toMatchObject({ error: 'string-error' });
      expect(warnCalls[1]?.[1]).toMatchObject({ error: '[object Object]' });
    });

    it('logs the all-endpoints-failed warn with the exact message + context when every endpoint throws', async () => {
      fetchSpy.mockRejectedValue(new Error('network down'));

      const results = await queryOverpassMuseums({
        lat: 1.5,
        lng: 2.5,
        radiusMeters: 100,
      });

      expect(results).toEqual([]);
      expect(mockedLogger.warn).toHaveBeenCalledWith('All Overpass endpoints failed', {
        lat: 1.5,
        lng: 2.5,
        radiusMeters: 100,
        bbox: undefined,
      });
    });
  });
});

describe('queryOverpassOpeningHours', () => {
  const makeTagsResponse = (
    elements: {
      type: 'node' | 'way' | 'relation';
      id: number;
      tags?: Record<string, string>;
    }[],
  ) => ({ elements });

  it('returns the first non-empty opening_hours value from the first OK endpoint', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () =>
        makeTagsResponse([
          { type: 'node', id: 11, tags: { name: 'Louvre', opening_hours: 'Mo-Su 09:00-18:00' } },
        ]),
    });

    const value = await queryOverpassOpeningHours({ lat: 48.86, lng: 2.34 });

    expect(value).toBe('Mo-Su 09:00-18:00');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('uses the explicit radiusMeters when provided in the QL body', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () =>
        makeTagsResponse([{ type: 'node', id: 12, tags: { opening_hours: '24/7' } }]),
    });

    await queryOverpassOpeningHours({ lat: 1.1, lng: 2.2, radiusMeters: 250 });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = decodeURIComponent((init.body as string) ?? '');
    expect(body).toContain('around:250,1.1,2.2');
  });

  it('defaults the radius to 50 m when radiusMeters is omitted', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () =>
        makeTagsResponse([{ type: 'node', id: 13, tags: { opening_hours: 'Mo 10:00-12:00' } }]),
    });

    await queryOverpassOpeningHours({ lat: 1.1, lng: 2.2 });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = decodeURIComponent((init.body as string) ?? '');
    expect(body).toContain('around:50,1.1,2.2');
  });

  it('skips whitespace-only opening_hours and tries the next element', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () =>
        makeTagsResponse([
          { type: 'node', id: 21, tags: { opening_hours: '   ' } },
          { type: 'node', id: 22, tags: { opening_hours: 'Tu-Su 10:00-18:00' } },
        ]),
    });

    const value = await queryOverpassOpeningHours({ lat: 48.86, lng: 2.34 });

    expect(value).toBe('Tu-Su 10:00-18:00');
  });

  it('returns null when the first OK endpoint has no opening_hours in any element', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () =>
        makeTagsResponse([
          { type: 'node', id: 31, tags: { name: 'No Hours Museum' } },
          { type: 'node', id: 32, tags: {} },
          { type: 'node', id: 33 }, // no tags at all → optional chaining branch
        ]),
    });

    const value = await queryOverpassOpeningHours({ lat: 48.86, lng: 2.34 });

    expect(value).toBeNull();
    // Endpoint chain MUST short-circuit once a non-OK -> null answer comes back
    // (we returned null, not continued).
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('returns null when the response has no elements array (unexpected shape)', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ unexpected: 'shape' }),
    });

    const value = await queryOverpassOpeningHours({ lat: 48.86, lng: 2.34 });

    expect(value).toBeNull();
    // Falls through all endpoints (no elements means continue chain).
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('falls back to the next endpoint when the first returns non-OK status', async () => {
    fetchSpy
      .mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Service Unavailable' })
      .mockResolvedValueOnce({
        ok: true,
        json: async () =>
          makeTagsResponse([
            { type: 'node', id: 41, tags: { opening_hours: 'Fr-Su 11:00-17:00' } },
          ]),
      });

    const value = await queryOverpassOpeningHours({ lat: 48.86, lng: 2.34 });

    expect(value).toBe('Fr-Su 11:00-17:00');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('walks the full endpoint chain and returns null when every endpoint throws', async () => {
    fetchSpy.mockRejectedValue(new Error('boom-net'));

    const value = await queryOverpassOpeningHours({ lat: 12.5, lng: -3.25 });

    expect(value).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    // Catch-branch warn: must use the exact message + full context shape.
    expect(mockedLogger.warn).toHaveBeenCalledWith(
      'Overpass opening_hours query failed — trying next',
      expect.objectContaining({
        endpoint: expect.any(String),
        error: 'boom-net',
        lat: 12.5,
        lng: -3.25,
      }),
    );

    // Final all-failed warn: exact message + exact context shape.
    expect(mockedLogger.warn).toHaveBeenCalledWith(
      'All Overpass endpoints failed for opening_hours',
      { lat: 12.5, lng: -3.25 },
    );
  });

  it('stringifies non-Error throwables in the catch-branch warn context', async () => {
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- non-Error rejection IS the behavior under test (ternary false branch / String(error) fallback)
    fetchSpy.mockReturnValue(Promise.reject('oh-no'));

    const value = await queryOverpassOpeningHours({ lat: 0, lng: 0 });

    expect(value).toBeNull();
    const catchWarns = mockedLogger.warn.mock.calls.filter(
      ([msg]) => msg === 'Overpass opening_hours query failed — trying next',
    );
    expect(catchWarns).toHaveLength(3);
    for (const call of catchWarns) {
      expect(call[1]).toMatchObject({ error: 'oh-no', lat: 0, lng: 0 });
    }
  });
});
