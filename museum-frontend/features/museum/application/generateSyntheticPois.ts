import { faker } from '@faker-js/faker';

import type { MuseumWithDistance } from './useMuseumDirectory';

export interface SyntheticPoiOptions {
  centerLat: number;
  centerLng: number;
  count: number;
  spreadDegrees?: number;
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
