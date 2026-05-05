import { buildMuseumFeatureCollection } from '@/features/museum/application/buildMuseumFeatureCollection';
import { makeMuseumWithDistance } from '@/__tests__/helpers/factories/museum.factories';

describe('buildMuseumFeatureCollection', () => {
  it('returns an empty FeatureCollection for an empty museum list', () => {
    const fc = buildMuseumFeatureCollection([]);
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toEqual([]);
  });

  it('maps one museum with valid coords to one Feature with GeoJSON [lng, lat] order', () => {
    // Paris Louvre: lat ≈ 48.86, lng ≈ 2.34. The [lng, lat] order is the load-bearing
    // assertion — inverting it plots Paris museums in the Indian Ocean (lat <-> lng).
    const louvre = makeMuseumWithDistance({
      id: 1,
      name: 'Louvre',
      latitude: 48.8606,
      longitude: 2.3376,
      source: 'local',
      museumType: 'art',
    });

    const fc = buildMuseumFeatureCollection([louvre]);

    expect(fc.features).toHaveLength(1);
    const feature = fc.features[0]!;
    expect(feature.type).toBe('Feature');
    expect(feature.geometry.type).toBe('Point');
    // RFC 7946 mandates [longitude, latitude]. Flip this and the map breaks.
    expect(feature.geometry.coordinates).toEqual([2.3376, 48.8606]);
    expect(feature.properties).toEqual({
      museumId: 1,
      name: 'Louvre',
      source: 'local',
      museumType: 'art',
    });
  });

  it('filters out museums with null latitude', () => {
    const museums = [
      makeMuseumWithDistance({ id: 1, latitude: null, longitude: 2.3 }),
      makeMuseumWithDistance({ id: 2, latitude: 48.8, longitude: 2.3 }),
    ];

    const fc = buildMuseumFeatureCollection(museums);

    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]?.properties.museumId).toBe(2);
  });

  it('filters out museums with null longitude', () => {
    const museums = [
      makeMuseumWithDistance({ id: 1, latitude: 48.8, longitude: null }),
      makeMuseumWithDistance({ id: 2, latitude: 48.9, longitude: 2.4 }),
    ];

    const fc = buildMuseumFeatureCollection(museums);

    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]?.properties.museumId).toBe(2);
  });

  it('filters out museums with both coords null', () => {
    const museums = [
      makeMuseumWithDistance({ id: 1, latitude: null, longitude: null }),
      makeMuseumWithDistance({ id: 2, latitude: null, longitude: null }),
    ];

    const fc = buildMuseumFeatureCollection(museums);

    expect(fc.features).toEqual([]);
  });

  it("preserves source 'local' vs 'osm' distinction on each Feature", () => {
    const local = makeMuseumWithDistance({
      id: 10,
      latitude: 48.86,
      longitude: 2.33,
      source: 'local',
    });
    const osm = makeMuseumWithDistance({
      id: 11,
      latitude: 48.87,
      longitude: 2.34,
      source: 'osm',
    });

    const fc = buildMuseumFeatureCollection([local, osm]);

    expect(fc.features.map((f) => f.properties.source)).toEqual(['local', 'osm']);
  });

  it('preserves every museumType value across the set', () => {
    const types = ['art', 'history', 'science', 'specialized', 'general'] as const;
    const museums = types.map((t, i) =>
      makeMuseumWithDistance({
        id: 100 + i,
        latitude: 48.86 + i * 0.001,
        longitude: 2.33,
        museumType: t,
      }),
    );

    const fc = buildMuseumFeatureCollection(museums);

    expect(fc.features.map((f) => f.properties.museumType)).toEqual([...types]);
  });

  it('handles a mixed list: 2 valid + 1 null coords yields 2 features', () => {
    const museums = [
      makeMuseumWithDistance({ id: 1, latitude: 48.86, longitude: 2.33 }),
      makeMuseumWithDistance({ id: 2, latitude: null, longitude: null }),
      makeMuseumWithDistance({ id: 3, latitude: 48.87, longitude: 2.34 }),
    ];

    const fc = buildMuseumFeatureCollection(museums);

    expect(fc.features).toHaveLength(2);
    expect(fc.features.map((f) => f.properties.museumId)).toEqual([1, 3]);
  });

  it('maintains input order', () => {
    const museums = [
      makeMuseumWithDistance({ id: 3, name: 'Third', latitude: 48.86, longitude: 2.33 }),
      makeMuseumWithDistance({ id: 1, name: 'First', latitude: 48.87, longitude: 2.34 }),
      makeMuseumWithDistance({ id: 2, name: 'Second', latitude: 48.88, longitude: 2.35 }),
    ];

    const fc = buildMuseumFeatureCollection(museums);

    expect(fc.features.map((f) => f.properties.museumId)).toEqual([3, 1, 2]);
    expect(fc.features.map((f) => f.properties.name)).toEqual(['Third', 'First', 'Second']);
  });

  it('accepts a readonly array and does not mutate the input', () => {
    const base = [
      makeMuseumWithDistance({ id: 1, latitude: 48.86, longitude: 2.33 }),
      makeMuseumWithDistance({ id: 2, latitude: null, longitude: null }),
    ];
    const snapshot = base.map((m) => ({ ...m }));
    const readonlyInput: readonly (typeof base)[number][] = base;

    buildMuseumFeatureCollection(readonlyInput);

    // Nothing in the caller's array was reassigned or reordered.
    expect(base).toEqual(snapshot);
    expect(base).toHaveLength(2);
  });
});
