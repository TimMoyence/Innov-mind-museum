/**
 * T1.7.b4 — coverage for the `hasPgPool` type predicate that replaced the
 * `as unknown as` cast in `startPoolMonitor`. The predicate guards the
 * pg-specific `master` pool stats object before the monitor reads counters.
 *
 * We split coverage between (a) direct unit tests of `hasPgPool` over a
 * matrix of driver shapes, and (b) one integration assertion that
 * `startPoolMonitor` returns a NodeJS.Timeout and tears down cleanly when
 * the predicate is false (driver missing `master`).
 *
 * Direct DataSource bootstrap is out of scope — we only verify that the
 * monitor's `setInterval` callback short-circuits via the predicate, which
 * we exercise by checking `hasPgPool` independently.
 */

import { hasPgPool, startPoolMonitor } from '@data/db/data-source';

describe('hasPgPool — pg pool-stats type predicate', () => {
  it('returns false for null', () => {
    expect(hasPgPool(null)).toBe(false);
  });

  it('returns false for primitive driver values', () => {
    expect(hasPgPool(undefined)).toBe(false);
    expect(hasPgPool(42)).toBe(false);
    expect(hasPgPool('pg')).toBe(false);
    expect(hasPgPool(true)).toBe(false);
  });

  it('returns false for an object without a `master` property', () => {
    expect(hasPgPool({ database: 'museum' })).toBe(false);
  });

  it('returns false when `master` is null', () => {
    expect(hasPgPool({ master: null })).toBe(false);
  });

  it('returns false when `master` is not an object', () => {
    expect(hasPgPool({ master: 'pool' })).toBe(false);
    expect(hasPgPool({ master: 7 })).toBe(false);
  });

  it('returns false when `master` is missing one of the required numeric counters', () => {
    expect(hasPgPool({ master: { totalCount: 1, idleCount: 1 } })).toBe(false);
    expect(hasPgPool({ master: { totalCount: 1, waitingCount: 0 } })).toBe(false);
    expect(hasPgPool({ master: { idleCount: 1, waitingCount: 0 } })).toBe(false);
  });

  it('returns false when a counter is the wrong type', () => {
    expect(hasPgPool({ master: { totalCount: '5', idleCount: 1, waitingCount: 0 } })).toBe(false);
  });

  it('returns true for a fully-shaped pg driver', () => {
    const driver = { master: { totalCount: 10, idleCount: 4, waitingCount: 2 } };
    expect(hasPgPool(driver)).toBe(true);
  });

  it('narrows the input so `.master` counters are typed numbers', () => {
    const driver: unknown = { master: { totalCount: 10, idleCount: 4, waitingCount: 2 } };
    if (hasPgPool(driver)) {
      // If this compiles, the predicate narrows correctly — no runtime check
      // needed here, the test is the TS compile path.
      const sum: number = driver.master.totalCount + driver.master.idleCount;
      expect(sum).toBe(14);
    } else {
      throw new Error('predicate should narrow');
    }
  });
});

describe('startPoolMonitor — interval lifecycle', () => {
  it('returns a NodeJS.Timeout handle that can be cleared without firing the callback in tests', () => {
    // The pool monitor's interval callback short-circuits on the predicate
    // (no real driver here), so this is a smoke test confirming the
    // interval handle is well-formed. We clear immediately to avoid leaks.
    const handle = startPoolMonitor(60_000);
    expect(handle).toBeDefined();
    // NodeJS.Timeout has a `ref` method — check via duck-typing.
    expect(typeof (handle as unknown as { ref?: unknown }).ref).toBe('function');
    clearInterval(handle);
  });
});
