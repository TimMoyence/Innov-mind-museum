import { generateSyntheticPois } from '@/features/museum/application/generateSyntheticPois';

describe('generateSyntheticPois', () => {
  const PARIS = { centerLat: 48.8566, centerLng: 2.3522 };

  it('produces the requested count', () => {
    const pois = generateSyntheticPois({ ...PARIS, count: 200 });
    expect(pois).toHaveLength(200);
  });

  it('stays within the spread radius around the centroid', () => {
    const spread = 0.05;
    const pois = generateSyntheticPois({ ...PARIS, count: 50, spreadDegrees: spread });
    for (const poi of pois) {
      expect(poi.latitude).not.toBeNull();
      expect(poi.longitude).not.toBeNull();
      expect(Math.abs((poi.latitude ?? 0) - PARIS.centerLat)).toBeLessThanOrEqual(spread);
      expect(Math.abs((poi.longitude ?? 0) - PARIS.centerLng)).toBeLessThanOrEqual(spread);
    }
  });

  it('is deterministic for the same seed', () => {
    const first = generateSyntheticPois({ ...PARIS, count: 10, seed: 'test-seed' });
    const second = generateSyntheticPois({ ...PARIS, count: 10, seed: 'test-seed' });
    expect(second.map((p) => [p.latitude, p.longitude, p.name])).toEqual(
      first.map((p) => [p.latitude, p.longitude, p.name]),
    );
  });

  it('cycles museum types deterministically', () => {
    const pois = generateSyntheticPois({ ...PARIS, count: 10, seed: 'types-seed' });
    const types = pois.map((p) => p.museumType);
    expect(new Set(types).size).toBeGreaterThan(1);
  });

  it('assigns stable negative ids so they never collide with backend ids', () => {
    const pois = generateSyntheticPois({ ...PARIS, count: 5 });
    for (const poi of pois) {
      expect(poi.id).toBeLessThan(0);
    }
  });
});
