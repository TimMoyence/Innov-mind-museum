import { QL_TIMEOUT_SECONDS } from './overpass-constants';

import type { OverpassBoundingBox } from './overpass-types';

/**
 * Builds an Overpass QL query for museums within a radius of a given point.
 *
 * Uses the `nwr` shortcut purely for readability (same execution plan as
 * `(node; way; relation;)` — Overpass-API issue #504). The real fix for
 * the 504s is the `[timeout:180]` admission budget — see QL_TIMEOUT_SECONDS
 * for the full explanation.
 */
export const buildRadiusQuery = (lat: number, lng: number, radiusMeters: number): string => {
  const r = String(radiusMeters);
  const coords = `${String(lat)},${String(lng)}`;
  return [
    `[out:json][timeout:${String(QL_TIMEOUT_SECONDS)}];`,
    `nwr["tourism"="museum"](around:${r},${coords});`,
    'out center;',
  ].join('\n');
};

/**
 * Builds an Overpass QL query for museums inside a bounding box.
 * Overpass uses (south,west,north,east) ordering — opposite to GeoJSON.
 */
export const buildBboxQuery = (bbox: OverpassBoundingBox): string => {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const filter = `${String(minLat)},${String(minLng)},${String(maxLat)},${String(maxLng)}`;
  return [
    `[out:json][timeout:${String(QL_TIMEOUT_SECONDS)}];`,
    `nwr["tourism"="museum"](${filter});`,
    'out center;',
  ].join('\n');
};

/** Builds a tag-only Overpass QL query asking for `opening_hours` near a point. */
export const buildOpeningHoursQuery = (lat: number, lng: number, radiusMeters: number): string => {
  return [
    `[out:json][timeout:${String(QL_TIMEOUT_SECONDS)}];`,
    `nwr["tourism"="museum"]["opening_hours"](around:${String(radiusMeters)},${String(lat)},${String(lng)});`,
    'out tags 1;',
  ].join('\n');
};
