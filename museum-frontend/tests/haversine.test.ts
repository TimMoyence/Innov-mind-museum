import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { haversineDistanceMeters } from '../features/museum/application/haversine';

describe('haversineDistanceMeters', () => {
  it('returns ~340 km (340 000 m) for Paris to London', () => {
    // Paris: 48.8566 N, 2.3522 E — London: 51.5074 N, -0.1278 W
    const distance = haversineDistanceMeters(48.8566, 2.3522, 51.5074, -0.1278);
    assert.ok(distance > 330_000, `expected > 330 000 m, got ${distance}`);
    assert.ok(distance < 350_000, `expected < 350 000 m, got ${distance}`);
  });

  it('returns 0 for the same point', () => {
    const distance = haversineDistanceMeters(48.8566, 2.3522, 48.8566, 2.3522);
    assert.equal(distance, 0);
  });

  it('handles negative coordinates (Buenos Aires to Cape Town)', () => {
    // Buenos Aires: -34.6037 S, -58.3816 W — Cape Town: -33.9249 S, 18.4241 E
    const distance = haversineDistanceMeters(-34.6037, -58.3816, -33.9249, 18.4241);
    assert.ok(distance > 6_800_000, `expected > 6 800 000 m, got ${distance}`);
    assert.ok(distance < 7_100_000, `expected < 7 100 000 m, got ${distance}`);
  });

  it('handles large distances — near-antipodal points', () => {
    // North Pole to South Pole ≈ ~20 015 km (half the circumference)
    const distance = haversineDistanceMeters(90, 0, -90, 0);
    assert.ok(distance > 20_000_000, `expected > 20 000 000 m, got ${distance}`);
    assert.ok(distance < 20_100_000, `expected < 20 100 000 m, got ${distance}`);
  });

  it('returns same distance regardless of argument order', () => {
    const d1 = haversineDistanceMeters(48.8566, 2.3522, 51.5074, -0.1278);
    const d2 = haversineDistanceMeters(51.5074, -0.1278, 48.8566, 2.3522);
    assert.ok(Math.abs(d1 - d2) < 1, 'distance should be symmetric (± 1 m)');
  });

  it('handles equator-to-equator at different longitudes', () => {
    // 90 degrees apart on the equator ≈ 10 018 km
    const distance = haversineDistanceMeters(0, 0, 0, 90);
    assert.ok(distance > 9_900_000, `expected > 9 900 000 m, got ${distance}`);
    assert.ok(distance < 10_100_000, `expected < 10 100 000 m, got ${distance}`);
  });
});
