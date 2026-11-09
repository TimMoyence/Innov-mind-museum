import type { FeatureCollection, Point } from 'geojson';

import type { MuseumFeatureProperties } from './buildMuseumFeatureCollection';
import { haversineDistanceMeters } from './haversine';

export const FIT_PADDING = 72;
const FIT_MIN_SPAN_DEG = 0.01;
export const SINGLE_POINT_ZOOM = 14;
const MAX_FIT_SPAN_METERS = 50_000;

export interface FitFlyTo {
  kind: 'flyTo';
  center: [number, number];
  zoom: number;
}

export interface FitBounds {
  kind: 'fitBounds';
  bounds: [number, number, number, number];
}

export type FitTarget = FitFlyTo | FitBounds | { kind: 'skip-empty' } | { kind: 'skip-too-wide' };

export const computeMuseumMapFitTarget = (
  museumCollection: FeatureCollection<Point, MuseumFeatureProperties>,
  userLatitude: number | null,
  userLongitude: number | null,
): FitTarget => {
  const points: [number, number][] = museumCollection.features.map(
    (f) => f.geometry.coordinates as [number, number],
  );
  if (userLatitude !== null && userLongitude !== null) {
    points.push([userLongitude, userLatitude]);
  }
  const first = points[0];
  if (!first) return { kind: 'skip-empty' };
  if (points.length === 1) {
    return { kind: 'flyTo', center: first, zoom: SINGLE_POINT_ZOOM };
  }

  let minLng = first[0];
  let maxLng = first[0];
  let minLat = first[1];
  let maxLat = first[1];
  for (const [lng, lat] of points) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  if (maxLng - minLng < FIT_MIN_SPAN_DEG) {
    minLng -= FIT_MIN_SPAN_DEG / 2;
    maxLng += FIT_MIN_SPAN_DEG / 2;
  }
  if (maxLat - minLat < FIT_MIN_SPAN_DEG) {
    minLat -= FIT_MIN_SPAN_DEG / 2;
    maxLat += FIT_MIN_SPAN_DEG / 2;
  }

  const diagonalMeters = haversineDistanceMeters(minLat, minLng, maxLat, maxLng);
  if (diagonalMeters > MAX_FIT_SPAN_METERS) {
    return { kind: 'skip-too-wide' };
  }
  return { kind: 'fitBounds', bounds: [minLng, minLat, maxLng, maxLat] };
};
