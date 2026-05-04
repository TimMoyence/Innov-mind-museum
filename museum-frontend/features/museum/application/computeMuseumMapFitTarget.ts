import type { FeatureCollection, Point } from 'geojson';

import type { MuseumFeatureProperties } from './buildMuseumFeatureCollection';
import { haversineDistanceMeters } from './haversine';

export const FIT_PADDING = 72;
const FIT_MIN_SPAN_DEG = 0.01;
export const SINGLE_POINT_ZOOM = 14;
/**
 * Safety cap for auto-fit. When the dataset diagonal exceeds this (e.g. the
 * full-France directory fallback), we skip fitBounds so the camera doesn't
 * zoom the user out to a country-wide view after they had panned to a city.
 */
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

/**
 * `skip-empty` — no points to fit; caller should NOT mark the camera fitted
 * (keeps the retry-on-load codepath alive for the next data arrival).
 *
 * `skip-too-wide` — diagonal exceeds the safety cap; caller SHOULD mark the
 * camera fitted to suppress jumpy re-fits while the user pans.
 */
export type FitTarget = FitFlyTo | FitBounds | { kind: 'skip-empty' } | { kind: 'skip-too-wide' };

/**
 * Pure computation of the camera fit target for `MuseumMapView` — given a
 * GeoJSON museum collection plus an optional user position, returns either a
 * single-point flyTo, a clamped fit-bounds, or `skip` when there is nothing
 * to fit / the dataset is too wide to safely auto-fit.
 *
 * Extracted from `MuseumMapView` so the imperative camera callback in the
 * component stays small enough to keep the file under the 300 LOC budget.
 * No imperative state, no refs — the component owns the camera ref and the
 * `userPannedRef` / `hasFittedRef` guards.
 */
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
  if (points.length === 0) return { kind: 'skip-empty' };
  if (points.length === 1) {
    return { kind: 'flyTo', center: points[0], zoom: SINGLE_POINT_ZOOM };
  }

  let minLng = points[0][0];
  let maxLng = points[0][0];
  let minLat = points[0][1];
  let maxLat = points[0][1];
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
    // Diagonal too wide — caller should mark fitted and not move the camera.
    return { kind: 'skip-too-wide' };
  }
  return { kind: 'fitBounds', bounds: [minLng, minLat, maxLng, maxLat] };
};
