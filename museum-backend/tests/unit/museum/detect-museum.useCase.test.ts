import {
  computeConfidence,
  DetectMuseumUseCase,
} from '@modules/museum/useCase/detect/detect-museum.useCase';
import { geoDetectMuseumTotal } from '@shared/observability/prometheus-metrics';

import { makeMuseum, makeMuseumRepo } from 'tests/helpers/museum/museum.fixtures';

async function readCounter(
  outcome: 'hit-geofence' | 'hit-haversine' | 'miss' | 'error',
): Promise<number> {
  const counter = geoDetectMuseumTotal as unknown as {
    get: () => Promise<{ values: { value: number; labels: Record<string, string> }[] }>;
  };
  const data = await counter.get();
  const match = data.values.find((row) => row.labels.outcome === outcome);
  return match ? match.value : 0;
}

describe('DetectMuseumUseCase', () => {
  describe('computeConfidence (helper)', () => {
    const cases: [number, number][] = [
      [0, 1.0],
      [100, 0.8],
      [200, 0.6],
      [500, 0],
      [600, 0],
    ];
    it.each(cases)('distance=%dm → confidence=%s', (distance, expected) => {
      expect(computeConfidence(distance)).toBeCloseTo(expected, 2);
    });
  });

  describe('execute', () => {
    it('returns confidence=1.0 when geofence containment hits', async () => {
      const museum = makeMuseum({ id: 42, name: 'Louvre', latitude: 48.8606, longitude: 2.3376 });
      const repo = makeMuseumRepo({
        findByCoords: jest.fn().mockResolvedValue(museum),
      });

      const sut = new DetectMuseumUseCase(repo);
      const result = await sut.execute(48.8606, 2.3376);

      expect(result.museumId).toBe(42);
      expect(result.confidence).toBe(1.0);
      expect(result.name).toBe('Louvre');
      expect(repo.findAll).not.toHaveBeenCalled(); // short-circuit
    });

    it('falls back to Haversine when no geofence hit ; confidence decays with distance', async () => {
      const close = makeMuseum({
        id: 7,
        name: 'Close Museum',
        latitude: 48.86,
        longitude: 2.34,
      });
      const repo = makeMuseumRepo({
        findByCoords: jest.fn().mockResolvedValue(null),
        findAll: jest.fn().mockResolvedValue([close]),
      });

      const sut = new DetectMuseumUseCase(repo);
      // Same lat/lng as museum centroid → distance ≈ 0
      const result = await sut.execute(48.86, 2.34);

      expect(result.museumId).toBe(7);
      expect(result.confidence).toBeCloseTo(1.0, 2);
      expect(result.distance).toBe(0);
      expect(result.name).toBe('Close Museum');
    });

    it('returns null result when no museums within 50km', async () => {
      const far = makeMuseum({
        id: 99,
        name: 'Far Museum',
        latitude: 48.86,
        longitude: 2.34,
      });
      const repo = makeMuseumRepo({
        findByCoords: jest.fn().mockResolvedValue(null),
        findAll: jest.fn().mockResolvedValue([far]),
      });

      const sut = new DetectMuseumUseCase(repo);
      // Point in Tokyo — Far Museum is in Paris ; > 30 km cap of findNearbyMuseums
      const result = await sut.execute(35.6762, 139.6503);

      expect(result.museumId).toBeNull();
      expect(result.confidence).toBe(0);
      expect(result.distance).toBeNull();
      expect(result.name).toBeNull();
    });

    it('Haversine 200 m → confidence ≈ 0.6 (mid-bucket: confirm-sheet UX)', async () => {
      // ~200 m east of centroid via lat≈0, lng delta ~0.0027° at 48.86° latitude
      const museum = makeMuseum({
        id: 11,
        name: 'Mid Museum',
        latitude: 48.86,
        longitude: 2.34,
      });
      const repo = makeMuseumRepo({
        findByCoords: jest.fn().mockResolvedValue(null),
        findAll: jest.fn().mockResolvedValue([museum]),
      });

      const sut = new DetectMuseumUseCase(repo);
      const result = await sut.execute(48.86, 2.3427);

      expect(result.museumId).toBe(11);
      // ~200 m away → confidence ~0.6 (allow ±0.1 fudge for Haversine)
      expect(result.confidence).toBeGreaterThan(0.4);
      expect(result.confidence).toBeLessThan(0.8);
    });

    it('geofence-hit takes precedence over Haversine (does not run fallback)', async () => {
      const museum = makeMuseum({ id: 1, name: 'Geofence Hit' });
      const findAllSpy = jest.fn().mockResolvedValue([]);
      const repo = makeMuseumRepo({
        findByCoords: jest.fn().mockResolvedValue(museum),
        findAll: findAllSpy,
      });

      const sut = new DetectMuseumUseCase(repo);
      const result = await sut.execute(48.86, 2.34);

      expect(result.confidence).toBe(1.0);
      expect(findAllSpy).not.toHaveBeenCalled();
    });

    it('increments geo_detect_museum_total{outcome="hit-geofence"} on geofence hit', async () => {
      const museum = makeMuseum({ id: 5, name: 'Counter Museum' });
      const repo = makeMuseumRepo({
        findByCoords: jest.fn().mockResolvedValue(museum),
      });

      const before = await readCounter('hit-geofence');
      const sut = new DetectMuseumUseCase(repo);
      await sut.execute(48.86, 2.34);
      const after = await readCounter('hit-geofence');

      expect(after - before).toBeGreaterThanOrEqual(1);
    });

    it('increments geo_detect_museum_total{outcome="miss"} when no museum is found', async () => {
      const repo = makeMuseumRepo({
        findByCoords: jest.fn().mockResolvedValue(null),
        findAll: jest.fn().mockResolvedValue([]),
      });

      const before = await readCounter('miss');
      const sut = new DetectMuseumUseCase(repo);
      await sut.execute(0, 0);
      const after = await readCounter('miss');

      expect(after - before).toBeGreaterThanOrEqual(1);
    });

    // TD-43 — a thrown error must NOT inflate the {outcome="miss"} series (which
    // means "no museum nearby"). It gets its own {outcome="error"} label. FAILS
    // pre-fix (the catch path incremented 'miss').
    it('increments geo_detect_museum_total{outcome="error"} when detection throws', async () => {
      const repo = makeMuseumRepo({
        findByCoords: jest.fn().mockRejectedValue(new Error('db down')),
      });

      const beforeError = await readCounter('error');
      const beforeMiss = await readCounter('miss');
      const sut = new DetectMuseumUseCase(repo);
      await expect(sut.execute(0, 0)).rejects.toThrow('db down');
      const afterError = await readCounter('error');
      const afterMiss = await readCounter('miss');

      expect(afterError - beforeError).toBeGreaterThanOrEqual(1);
      expect(afterMiss - beforeMiss).toBe(0);
    });
  });
});
