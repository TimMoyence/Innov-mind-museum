import { haversineDistanceMeters } from '@shared/utils/haversine';

import type { NearbyMuseum } from '@modules/chat/domain/location/nearbyMuseum';
import type { IMuseumRepository } from '@modules/museum/domain/museum/museum.repository.interface';

export type { NearbyMuseum };

const MAX_NEARBY = 5;
const MAX_DISTANCE_METERS = 30_000;

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
      nearby.push({ id: museum.id, name: museum.name, distance: Math.round(distance) });
    }
  }

  nearby.sort((a, b) => a.distance - b.distance);
  return nearby.slice(0, MAX_NEARBY);
}
