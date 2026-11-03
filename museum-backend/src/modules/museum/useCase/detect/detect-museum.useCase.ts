import { findNearbyMuseums } from '@modules/chat/useCase/enrichment/nearby-museums.provider';
import { haversineDistanceMeters } from '@shared/utils/haversine';

import type { MuseumDetectionResult } from '@modules/museum/domain/museum/museum-detection-result';
import type { IMuseumRepository } from '@modules/museum/domain/museum/museum.repository.interface';

export class DetectMuseumUseCase {
  constructor(private readonly repository: IMuseumRepository) {}

  async execute(lat: number, lng: number): Promise<MuseumDetectionResult> {
    const geofenceHit = await this.repository.findByCoords(lat, lng);
    if (geofenceHit) {
      const distance =
        geofenceHit.latitude != null && geofenceHit.longitude != null
          ? Math.round(
              haversineDistanceMeters(lat, lng, geofenceHit.latitude, geofenceHit.longitude),
            )
          : 0;
      return { museumId: geofenceHit.id, confidence: 1, distance, name: geofenceHit.name };
    }

    const nearby = await findNearbyMuseums(lat, lng, this.repository);
    if (nearby.length === 0) {
      return { museumId: null, confidence: 0, distance: null, name: null };
    }

    const closest = nearby[0];
    return {
      museumId: closest.id,
      confidence: computeConfidence(closest.distance),
      distance: closest.distance,
      name: closest.name,
    };
  }
}

export function computeConfidence(distanceMeters: number): number {
  const raw = Math.max(0, 1 - distanceMeters / 500);
  return Math.round(raw * 100) / 100;
}
