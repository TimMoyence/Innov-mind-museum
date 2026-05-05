import { faker } from '@faker-js/faker';

import type { MuseumWithDistance } from './useMuseumDirectory';

export interface SyntheticPoiOptions {
  centerLat: number;
  centerLng: number;
  count: number;
  /** Half-side of the bbox in degrees. 0.075° ≈ 8 km at Paris latitude. */
  spreadDegrees?: number;
  /** faker seed so the same call always produces the same set. */
  seed?: string;
}

const DEFAULT_SPREAD_DEGREES = 0.075;
const MUSEUM_TYPES: readonly MuseumWithDistance['museumType'][] = [
  'art',
  'history',
  'science',
  'specialized',
  'general',
];

const hashSeed = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
};

/**
 * Produces a deterministic set of fake POIs used only by the development perf
 * HUD to stress-test clustering on a target device (Pixel 6a, iPhone 15). The
 * output matches the production `MuseumWithDistance` shape so it can be piped
 * into `MuseumMapView` without any branching.
 *
 * Never call this from production code paths — the `__DEV__` guard lives in
 * the caller so a single source of truth (the perf HUD entry point) decides
 * when synthetic data enters the map.
 */
export const generateSyntheticPois = ({
  centerLat,
  centerLng,
  count,
  spreadDegrees = DEFAULT_SPREAD_DEGREES,
  seed = 'musaium-s1',
}: SyntheticPoiOptions): MuseumWithDistance[] => {
  faker.seed(hashSeed(seed));
  const pois: MuseumWithDistance[] = [];
  for (let i = 0; i < count; i += 1) {
    const dLat = faker.number.float({ min: -spreadDegrees, max: spreadDegrees });
    const dLng = faker.number.float({ min: -spreadDegrees, max: spreadDegrees });
    const latitude = centerLat + dLat;
    const longitude = centerLng + dLng;
    const museumType = MUSEUM_TYPES[i % MUSEUM_TYPES.length] ?? 'general';
    pois.push({
      id: -(i + 1),
      name: faker.company.name(),
      slug: '',
      address: faker.location.streetAddress(),
      description: null,
      latitude,
      longitude,
      distanceMeters: Math.round(Math.sqrt(dLat * dLat + dLng * dLng) * 111_000),
      source: 'local',
      museumType,
    });
  }
  return pois;
};
