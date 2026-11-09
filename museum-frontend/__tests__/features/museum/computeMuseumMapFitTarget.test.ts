import { buildMuseumFeatureCollection } from '@/features/museum/application/buildMuseumFeatureCollection';
import {
  computeMuseumMapFitTarget,
  SINGLE_POINT_ZOOM,
} from '@/features/museum/application/computeMuseumMapFitTarget';
import { makeMuseumWithDistance } from '@/__tests__/helpers/factories/museum.factories';

describe('computeMuseumMapFitTarget', () => {
  it('returns kind="skip-empty" when there are no points to fit', () => {
    const empty = buildMuseumFeatureCollection([]);

    const target = computeMuseumMapFitTarget(empty, null, null);

    expect(target).toEqual({ kind: 'skip-empty' });
  });

  it('returns a flyTo with the single point + SINGLE_POINT_ZOOM when only one point is provided', () => {
    const louvre = makeMuseumWithDistance({
      id: 1,
      name: 'Louvre',
      latitude: 48.8606,
      longitude: 2.3376,
    });
    const collection = buildMuseumFeatureCollection([louvre]);

    const target = computeMuseumMapFitTarget(collection, null, null);

    expect(target).toEqual({
      kind: 'flyTo',
      center: [2.3376, 48.8606],
      zoom: SINGLE_POINT_ZOOM,
    });
  });

  it('returns a fitBounds covering the dataset when 2+ points fall within the safety cap', () => {
    const louvre = makeMuseumWithDistance({
      id: 1,
      name: 'Louvre',
      latitude: 48.8606,
      longitude: 2.3376,
    });
    const orsay = makeMuseumWithDistance({
      id: 2,
      name: "Musée d'Orsay",
      latitude: 48.86,
      longitude: 2.3266,
    });
    const collection = buildMuseumFeatureCollection([louvre, orsay]);

    const target = computeMuseumMapFitTarget(collection, null, null);

    expect(target.kind).toBe('fitBounds');
    if (target.kind !== 'fitBounds') return;
    const [minLng, minLat, maxLng, maxLat] = target.bounds;
    expect(minLng).toBeLessThanOrEqual(2.3266);
    expect(maxLng).toBeGreaterThanOrEqual(2.3376);
    expect(minLat).toBeLessThanOrEqual(48.86);
    expect(maxLat).toBeGreaterThanOrEqual(48.8606);
  });

  it('returns kind="skip-too-wide" when the dataset diagonal exceeds MAX_FIT_SPAN_METERS', () => {
    const brest = makeMuseumWithDistance({
      id: 1,
      name: 'Musée de Brest',
      latitude: 48.39,
      longitude: -4.49,
    });
    const strasbourg = makeMuseumWithDistance({
      id: 2,
      name: 'Musée de Strasbourg',
      latitude: 48.58,
      longitude: 7.75,
    });
    const collection = buildMuseumFeatureCollection([brest, strasbourg]);

    const target = computeMuseumMapFitTarget(collection, null, null);

    expect(target).toEqual({ kind: 'skip-too-wide' });
  });

  it('expands the min span when 2 points fall within FIT_MIN_SPAN_DEG of each other', () => {
    const a = makeMuseumWithDistance({
      id: 1,
      name: 'Museum A',
      latitude: 48.86,
      longitude: 2.34,
    });
    const b = makeMuseumWithDistance({
      id: 2,
      name: 'Museum B',
      latitude: 48.8601,
      longitude: 2.3401,
    });
    const collection = buildMuseumFeatureCollection([a, b]);

    const target = computeMuseumMapFitTarget(collection, null, null);

    expect(target.kind).toBe('fitBounds');
    if (target.kind !== 'fitBounds') return;
    const [minLng, minLat, maxLng, maxLat] = target.bounds;
    expect(maxLng - minLng).toBeGreaterThanOrEqual(0.01 - 1e-9);
    expect(maxLat - minLat).toBeGreaterThanOrEqual(0.01 - 1e-9);
  });
});
