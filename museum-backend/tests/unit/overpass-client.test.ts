import { queryOverpassMuseums } from '@shared/http/overpass.client';

let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  fetchSpy = jest.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  fetchSpy.mockRestore();
});

const makeOverpassResponse = (
  elements: Array<{
    type: 'node' | 'way' | 'relation';
    id: number;
    lat?: number;
    lon?: number;
    center?: { lat: number; lon: number };
    tags?: Record<string, string>;
  }>,
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
});
