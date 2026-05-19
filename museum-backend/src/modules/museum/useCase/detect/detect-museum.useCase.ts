import { findNearbyMuseums } from '@modules/chat/useCase/enrichment/nearby-museums.provider';
import { getLangfuse } from '@shared/observability/langfuse.client';
import { geoDetectMuseumTotal } from '@shared/observability/prometheus-metrics';
import { safeTrace } from '@shared/observability/safeTrace';
import { haversineDistanceMeters } from '@shared/utils/haversine';

import type { MuseumDetectionResult } from '@modules/museum/domain/museum/museum-detection-result';
import type { IMuseumRepository } from '@modules/museum/domain/museum/museum.repository.interface';

/**
 * W3 (spec R1-R4) — detects the museum a visitor is in / near based on GPS
 * coordinates. Two-step strategy:
 *
 *   1. Geofence containment lookup (`repository.findByCoords`). On hit →
 *      return `confidence=1.0`, `strategy='geofence'`. The PG adapter
 *      picks PostGIS vs JSONB bbox automatically (design.md §D1).
 *
 *   2. Haversine fallback via the existing `findNearbyMuseums` provider
 *      (kept as the single source of truth for "nearby" — reuse, not
 *      duplication, per UFR-016). Confidence decays linearly :
 *      `max(0, 1 - distance / 500)`, 2-decimal rounding.
 *
 * Emits a Langfuse span `geo.detect_museum` (`distance_bucket`,
 * `strategy`, `latency_ms`) + Prom counter `geo_detect_museum_total{outcome}`.
 * Both fail-open via `safeTrace()`.
 */
export class DetectMuseumUseCase {
  constructor(private readonly repository: IMuseumRepository) {}

  async execute(lat: number, lng: number): Promise<MuseumDetectionResult> {
    const startedAtMs = Date.now();
    const span = safeTrace('geo.detect_museum.start', () =>
      getLangfuse()?.span({
        name: 'geo.detect_museum',
        input: { lat_3dec: round3(lat), lng_3dec: round3(lng) },
      }),
    );

    try {
      // Step 1: geofence-containment short circuit.
      const geofenceHit = await this.repository.findByCoords(lat, lng);
      if (geofenceHit) {
        const distance =
          geofenceHit.latitude != null && geofenceHit.longitude != null
            ? Math.round(
                haversineDistanceMeters(lat, lng, geofenceHit.latitude, geofenceHit.longitude),
              )
            : 0;
        const result: MuseumDetectionResult = {
          museumId: geofenceHit.id,
          confidence: 1,
          distance,
          name: geofenceHit.name,
        };
        finalize(span, 'hit-geofence', result, startedAtMs);
        return result;
      }

      // Step 2: Haversine fallback via the shared provider — keeps the
      // "nearby" criteria (50 km cap, sort by distance asc) in one place.
      const nearby = await findNearbyMuseums(lat, lng, this.repository);
      if (nearby.length === 0) {
        const result: MuseumDetectionResult = {
          museumId: null,
          confidence: 0,
          distance: null,
          name: null,
        };
        finalize(span, 'miss', result, startedAtMs);
        return result;
      }

      const closest = nearby[0];
      const confidence = computeConfidence(closest.distance);

      const result: MuseumDetectionResult = {
        museumId: closest.id,
        confidence,
        distance: closest.distance,
        name: closest.name,
      };
      finalize(span, 'hit-haversine', result, startedAtMs);
      return result;
    } catch (err) {
      safeTrace('geo.detect_museum.error', () => {
        span?.update({ output: { error: err instanceof Error ? err.message : String(err) } });
        span?.end();
      });
      geoDetectMuseumTotal.labels('miss').inc();
      throw err;
    }
  }
}

/** Linear decay 0→500 m, 2-decimal rounded. Exported for unit testing. */
export function computeConfidence(distanceMeters: number): number {
  const raw = Math.max(0, 1 - distanceMeters / 500);
  return Math.round(raw * 100) / 100;
}

function distanceBucket(distance: number | null): string {
  if (distance == null) return 'none';
  if (distance < 100) return '0-100';
  if (distance < 250) return '100-250';
  if (distance < 500) return '250-500';
  return '500+';
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function finalize(
  span: ReturnType<NonNullable<ReturnType<typeof getLangfuse>>['span']> | undefined,
  outcome: 'hit-geofence' | 'hit-haversine' | 'miss',
  result: MuseumDetectionResult,
  startedAtMs: number,
): void {
  geoDetectMuseumTotal.labels(outcome).inc();
  safeTrace('geo.detect_museum.end', () => {
    span?.update({
      output: {
        museumId: result.museumId,
        confidence: result.confidence,
        strategy: outcome === 'hit-geofence' ? 'geofence' : 'haversine',
        distance_bucket: distanceBucket(result.distance),
        latency_ms: Date.now() - startedAtMs,
      },
    });
    span?.end();
  });
}
