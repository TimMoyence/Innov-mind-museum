import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatDistance,
  type DistanceTFunction,
} from '../features/museum/application/formatDistance';

// Minimal TFunction stub that echoes the key + interpolation for assertions.
const t: DistanceTFunction = (key, opts) => `${key}:${String(opts.distance)}`;

describe('formatDistance', () => {
  it('formats values < 1000 m with the distance_m key and meter rounding', () => {
    assert.equal(formatDistance(0, t), 'museumDirectory.distance_m:0');
    assert.equal(formatDistance(1, t), 'museumDirectory.distance_m:1');
    assert.equal(formatDistance(450, t), 'museumDirectory.distance_m:450');
    assert.equal(formatDistance(999, t), 'museumDirectory.distance_m:999');
  });

  it('rounds fractional meters to the nearest integer', () => {
    assert.equal(formatDistance(123.4, t), 'museumDirectory.distance_m:123');
    assert.equal(formatDistance(123.5, t), 'museumDirectory.distance_m:124');
  });

  it('formats values ≥ 1000 m with the distance_km key and 1 decimal', () => {
    assert.equal(formatDistance(1_000, t), 'museumDirectory.distance_km:1');
    assert.equal(formatDistance(1_234, t), 'museumDirectory.distance_km:1.2');
    assert.equal(formatDistance(2_500, t), 'museumDirectory.distance_km:2.5');
    assert.equal(formatDistance(15_678, t), 'museumDirectory.distance_km:15.7');
  });

  it('switches unit exactly at the 1000 m boundary', () => {
    assert.equal(formatDistance(999, t), 'museumDirectory.distance_m:999');
    assert.equal(formatDistance(1_000, t), 'museumDirectory.distance_km:1');
  });
});
