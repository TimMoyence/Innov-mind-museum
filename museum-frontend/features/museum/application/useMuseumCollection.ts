import { useMemo } from 'react';
import type { FeatureCollection, Point } from 'geojson';

import {
  buildMuseumFeatureCollection,
  type MuseumFeatureProperties,
} from './buildMuseumFeatureCollection';
import type { MuseumWithDistance } from './useMuseumDirectory';

/**
 * Memoizes the GeoJSON FeatureCollection projection of a museum slice.
 *
 * Stable across renders that pass the same `museums` reference. Wraps the pure
 * helper `buildMuseumFeatureCollection` in a single `useMemo`, so MapLibre's
 * GeoJSONSource sees a referentially stable `data` prop unless the museum
 * array reference itself changes.
 *
 * Mirrors the inline `useMemo` previously living in `MuseumMapView.tsx` —
 * extracted to keep the component shell under 300 LOC and to give the
 * projection a single, tested surface.
 */
export const useMuseumCollection = (
  museums: readonly MuseumWithDistance[],
): FeatureCollection<Point, MuseumFeatureProperties> =>
  useMemo(() => buildMuseumFeatureCollection(museums), [museums]);
