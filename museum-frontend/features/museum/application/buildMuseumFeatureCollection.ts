import type { Feature, FeatureCollection, Point } from 'geojson';

import type { MuseumWithDistance } from './useMuseumDirectory';

export interface MuseumFeatureProperties {
  museumId: number;
  name: string;
  source: 'local' | 'osm';
  museumType: MuseumWithDistance['museumType'];
}

export type MuseumFeature = Feature<Point, MuseumFeatureProperties>;

const toFeature = (museum: MuseumWithDistance): MuseumFeature | null => {
  if (museum.latitude == null || museum.longitude == null) return null;
  return {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [museum.longitude, museum.latitude],
    },
    properties: {
      museumId: museum.id,
      name: museum.name,
      source: museum.source,
      museumType: museum.museumType,
    },
  };
};

export const buildMuseumFeatureCollection = (
  museums: readonly MuseumWithDistance[],
): FeatureCollection<Point, MuseumFeatureProperties> => ({
  type: 'FeatureCollection',
  features: museums.map(toFeature).filter((f): f is MuseumFeature => f !== null),
});
