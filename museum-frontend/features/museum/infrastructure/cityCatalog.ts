import type { CityId } from './offlinePackManager';

export interface City {
  id: CityId;
  name: string;
  /** WGS84 [west, south, east, north] bounding box used for OfflineManager. */
  bounds: [number, number, number, number];
  /** Geographic centroid, [longitude, latitude]. */
  center: [number, number];
}

/**
 * Gate cities for the S1 offline pack rollout (Paris, Lyon, Bordeaux,
 * Lisbonne, Rome). The bounding boxes are tight enough to produce packs
 * well under 100 MB at zoom 10-16 while still covering the historical
 * cores where most museums in our directory sit.
 *
 * Keep this list ordered by how likely a user is to enter the city — the
 * UI renders packs in catalog order.
 */
export const CITY_CATALOG: readonly City[] = [
  {
    id: 'paris',
    name: 'Paris',
    bounds: [2.224, 48.815, 2.47, 48.902],
    center: [2.3522, 48.8566],
  },
  {
    id: 'lyon',
    name: 'Lyon',
    bounds: [4.769, 45.707, 4.898, 45.808],
    center: [4.835, 45.764],
  },
  {
    id: 'bordeaux',
    name: 'Bordeaux',
    bounds: [-0.656, 44.801, -0.521, 44.904],
    center: [-0.579, 44.838],
  },
  {
    id: 'lisbon',
    name: 'Lisbonne',
    bounds: [-9.23, 38.692, -9.09, 38.795],
    center: [-9.14, 38.722],
  },
  {
    id: 'rome',
    name: 'Rome',
    bounds: [12.39, 41.82, 12.59, 41.95],
    center: [12.4964, 41.9028],
  },
];

export const findCity = (cityId: CityId): City | undefined =>
  CITY_CATALOG.find((c) => c.id === cityId);
