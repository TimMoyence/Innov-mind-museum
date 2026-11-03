import {
  computeConfidence,
  DetectMuseumUseCase,
} from '@modules/museum/useCase/detect/detect-museum.useCase';

import { makeMuseum, makeMuseumRepo } from 'tests/helpers/museum/museum.fixtures';

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
  });
});
