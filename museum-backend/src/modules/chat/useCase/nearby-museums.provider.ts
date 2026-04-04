import type { IMuseumRepository } from '@modules/museum/domain/museum.repository.interface';

/** A museum within range of the user's coordinates, with haversine distance. */
export interface NearbyMuseum {
  name: string;
  distance: number;
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
    const distance = haversineDistance(lat, lng, museum.latitude, museum.longitude);
    if (distance <= MAX_DISTANCE_METERS) {
      nearby.push({ name: museum.name, distance: Math.round(distance) });
    }
  }

  nearby.sort((a, b) => a.distance - b.distance);
  return nearby.slice(0, MAX_NEARBY);
}
