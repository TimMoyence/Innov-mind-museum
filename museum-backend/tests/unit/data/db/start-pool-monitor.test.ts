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
      const sum: number = driver.master.totalCount + driver.master.idleCount;
      expect(sum).toBe(14);
    } else {
      throw new Error('predicate should narrow');
    }
  });
});

describe('startPoolMonitor — interval lifecycle', () => {
  it('returns a NodeJS.Timeout handle that can be cleared without firing the callback in tests', () => {
    const handle = startPoolMonitor(60_000);
    expect(handle).toBeDefined();
    expect(typeof (handle as unknown as { ref?: unknown }).ref).toBe('function');
    clearInterval(handle);
  });
});
