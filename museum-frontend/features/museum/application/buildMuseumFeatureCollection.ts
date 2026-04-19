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

/**
 * Projects a museum directory slice into the GeoJSON FeatureCollection shape
 * MapLibre's GeoJSONSource consumes. Museums without coordinates (OSM entries
 * occasionally lack lat/lng) are dropped — the UI uses this collection
 * exclusively for map rendering, not for list display.
 *
 * Coordinate order is `[longitude, latitude]` per RFC 7946 / GeoJSON spec.
 * Pairing callers that expect `[lat, lng]` will silently plot in the wrong
 * hemisphere, so only this helper should construct the geometry.
 */
export const buildMuseumFeatureCollection = (
  museums: readonly MuseumWithDistance[],
): FeatureCollection<Point, MuseumFeatureProperties> => ({
  type: 'FeatureCollection',
  features: museums.map(toFeature).filter((f): f is MuseumFeature => f !== null),
});
