import { buildMuseumFeatureCollection } from '@/features/museum/application/buildMuseumFeatureCollection';
import {
  computeMuseumMapFitTarget,
  SINGLE_POINT_ZOOM,
} from '@/features/museum/application/computeMuseumMapFitTarget';
import { makeMuseumWithDistance } from '@/__tests__/helpers/factories/museum.factories';

/**
 * Direct unit coverage for the pure fit-target computation extracted from
 * `MuseumMapView` during the F2 refactor. The component shell trusts this
 * helper to choose between flyTo / fitBounds / skip, so each branch needs
 * an explicit assertion rather than only being exercised through the
 * integration-flavoured `MuseumMapView.test.tsx` harness.
 */
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
      // GeoJSON [lng, lat] — the helper preserves the source-of-truth ordering.
      center: [2.3376, 48.8606],
      zoom: SINGLE_POINT_ZOOM,
    });
  });

  it('returns a fitBounds covering the dataset when 2+ points fall within the safety cap', () => {
    // Two Paris museums ~3 km apart — well under the 50 km MAX_FIT_SPAN cap.
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
    // Span widens via FIT_MIN_SPAN_DEG (0.01°) when the raw span is tiny;
    // the resulting bounds must still bracket both museums on each axis.
    expect(minLng).toBeLessThanOrEqual(2.3266);
    expect(maxLng).toBeGreaterThanOrEqual(2.3376);
    expect(minLat).toBeLessThanOrEqual(48.86);
    expect(maxLat).toBeGreaterThanOrEqual(48.8606);
  });

  it('returns kind="skip-too-wide" when the dataset diagonal exceeds MAX_FIT_SPAN_METERS', () => {
    // Brest (~ 48.39, -4.49) ↔ Strasbourg (~ 48.58, 7.75) — diagonal > 800 km,
    // far above the 50 km safety cap. Helper must refuse to auto-fit so the
    // camera doesn't zoom out to a country-wide view.
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
    // Two museums ~10 m apart — far below the 0.01° (~1 km) minimum span.
    // Helper must widen the bounds so the camera doesn't zoom in past the
    // useful detail level.
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
    // Expanded span MUST reach at least FIT_MIN_SPAN_DEG (0.01°) on each axis
    // — this is the load-bearing property the helper guarantees for tightly
    // clustered points.
    expect(maxLng - minLng).toBeGreaterThanOrEqual(0.01 - 1e-9);
    expect(maxLat - minLat).toBeGreaterThanOrEqual(0.01 - 1e-9);
  });
});
