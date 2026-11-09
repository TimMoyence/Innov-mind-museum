import { useMemo } from 'react';
import type { FeatureCollection, Point } from 'geojson';

import {
  buildMuseumFeatureCollection,
  type MuseumFeatureProperties,
} from './buildMuseumFeatureCollection';
import type { MuseumWithDistance } from './useMuseumDirectory';

export const useMuseumCollection = (
  museums: readonly MuseumWithDistance[],
): FeatureCollection<Point, MuseumFeatureProperties> =>
  useMemo(() => buildMuseumFeatureCollection(museums), [museums]);
