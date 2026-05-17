import { QL_TIMEOUT_SECONDS } from './overpass-constants';

import type { OverpassBoundingBox } from './overpass-types';

/** `nwr` = readability shortcut for `(node;way;relation;)` (Overpass-API #504, same plan). */
export const buildRadiusQuery = (lat: number, lng: number, radiusMeters: number): string => {
  const r = String(radiusMeters);
  const coords = `${String(lat)},${String(lng)}`;
  return [
    `[out:json][timeout:${String(QL_TIMEOUT_SECONDS)}];`,
    `nwr["tourism"="museum"](around:${r},${coords});`,
    'out center;',
  ].join('\n');
};

/** Overpass uses (S,W,N,E) ordering — opposite to GeoJSON. */
export const buildBboxQuery = (bbox: OverpassBoundingBox): string => {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const filter = `${String(minLat)},${String(minLng)},${String(maxLat)},${String(maxLng)}`;
  return [
    `[out:json][timeout:${String(QL_TIMEOUT_SECONDS)}];`,
    `nwr["tourism"="museum"](${filter});`,
    'out center;',
  ].join('\n');
};

export const buildOpeningHoursQuery = (lat: number, lng: number, radiusMeters: number): string => {
  return [
    `[out:json][timeout:${String(QL_TIMEOUT_SECONDS)}];`,
    `nwr["tourism"="museum"]["opening_hours"](around:${String(radiusMeters)},${String(lat)},${String(lng)});`,
    'out tags 1;',
  ].join('\n');
};
