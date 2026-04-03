import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { haversineDistance } from '../features/museum/application/haversine';

describe('haversineDistance', () => {
  it('returns ~340 km for Paris to London', () => {
    // Paris: 48.8566 N, 2.3522 E — London: 51.5074 N, -0.1278 W
    const distance = haversineDistance(48.8566, 2.3522, 51.5074, -0.1278);
    assert.ok(distance > 330, `expected > 330 km, got ${distance}`);
    assert.ok(distance < 350, `expected < 350 km, got ${distance}`);
  });

  it('returns 0 for the same point', () => {
    const distance = haversineDistance(48.8566, 2.3522, 48.8566, 2.3522);
    assert.equal(distance, 0);
  });

  it('handles negative coordinates (Buenos Aires to Cape Town)', () => {
    // Buenos Aires: -34.6037 S, -58.3816 W — Cape Town: -33.9249 S, 18.4241 E
    const distance = haversineDistance(-34.6037, -58.3816, -33.9249, 18.4241);
    assert.ok(distance > 6800, `expected > 6800 km, got ${distance}`);
    assert.ok(distance < 7100, `expected < 7100 km, got ${distance}`);
  });

  it('handles large distances — near-antipodal points', () => {
    // North Pole to South Pole ≈ ~20015 km (half the circumference)
    const distance = haversineDistance(90, 0, -90, 0);
    assert.ok(distance > 20_000, `expected > 20000 km, got ${distance}`);
    assert.ok(distance < 20_100, `expected < 20100 km, got ${distance}`);
  });

  it('returns same distance regardless of argument order', () => {
    const d1 = haversineDistance(48.8566, 2.3522, 51.5074, -0.1278);
    const d2 = haversineDistance(51.5074, -0.1278, 48.8566, 2.3522);
    assert.ok(Math.abs(d1 - d2) < 0.001, 'distance should be symmetric');
  });

  it('handles equator-to-equator at different longitudes', () => {
    // 90 degrees apart on the equator ≈ 10018 km
    const distance = haversineDistance(0, 0, 0, 90);
    assert.ok(distance > 9_900, `expected > 9900 km, got ${distance}`);
    assert.ok(distance < 10_100, `expected < 10100 km, got ${distance}`);
  });
});
