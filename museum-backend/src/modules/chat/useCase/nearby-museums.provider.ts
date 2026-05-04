import { haversineDistanceMeters } from '@shared/utils/haversine';

import type { IMuseumRepository } from '@modules/museum/domain/museum/museum.repository.interface';

/** A museum within range of the user's coordinates, with haversine distance. */
export interface NearbyMuseum {
  name: string;
  distance: number;
}

const MAX_NEARBY = 5;
const MAX_DISTANCE_METERS = 30_000;

/**
 * Finds the nearest museums within {@link MAX_DISTANCE_METERS} of the given coordinates.
 *
 * @param lat - Latitude of the user's position.
 * @param lng - Longitude of the user's position.
 * @param repository - Museum repository for fetching active museums.
 * @returns Up to {@link MAX_NEARBY} museums sorted by ascending distance.
 */
export async function findNearbyMuseums(
  lat: number,
  lng: number,
  repository: IMuseumRepository,
): Promise<NearbyMuseum[]> {
  const museums = await repository.findAll({ activeOnly: true });
  const nearby: NearbyMuseum[] = [];

  for (const museum of museums) {
    if (museum.latitude == null || museum.longitude == null) continue;
    const distance = haversineDistanceMeters(lat, lng, museum.latitude, museum.longitude);
    if (distance <= MAX_DISTANCE_METERS) {
      nearby.push({ name: museum.name, distance: Math.round(distance) });
    }
  }

  nearby.sort((a, b) => a.distance - b.distance);
  return nearby.slice(0, MAX_NEARBY);
}
