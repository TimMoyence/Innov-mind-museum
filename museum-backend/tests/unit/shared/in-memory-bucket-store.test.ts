import {
  makeBucket,
  makeBucketStore,
  type TestBucket,
} from 'tests/helpers/rate-limit/bucket-store.fixtures';

describe('InMemoryBucketStore', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('stores and retrieves entries', () => {
    const store = makeBucketStore();
    const entry = makeBucket({ value: 1, expiresAt: Date.now() + 10_000 });
    store.set('key1', entry);
    expect(store.get('key1')).toEqual(entry);
  });

  it('returns undefined for non-existent key', () => {
    const store = makeBucketStore();
    expect(store.get('nonexistent')).toBeUndefined();
  });

  it('deletes entries', () => {
    const store = makeBucketStore();
    store.set('key1', makeBucket());
    store.delete('key1');
    expect(store.get('key1')).toBeUndefined();
  });

  it('clears all entries and stops sweep', () => {
    const store = makeBucketStore();
    store.set('key1', makeBucket({ value: 1 }));
    store.set('key2', makeBucket({ value: 2 }));
    expect(store.size).toBe(2);

    const clearSpy = jest.spyOn(global, 'clearInterval');
    store.clear();
    expect(store.size).toBe(0);
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });

  it('reports size correctly', () => {
    const store = makeBucketStore();
    expect(store.size).toBe(0);
    store.set('a', makeBucket({ value: 1 }));
    expect(store.size).toBe(1);
    store.set('b', makeBucket({ value: 2 }));
    expect(store.size).toBe(2);
  });

  it('evicts oldest entry when maxSize is exceeded', () => {
    const store = makeBucketStore({ maxSize: 2 });
    store.set('first', makeBucket({ value: 1 }));
    store.set('second', makeBucket({ value: 2 }));
    store.set('third', makeBucket({ value: 3 }));

    expect(store.get('first')).toBeUndefined();
    expect(store.get('second')).toBeDefined();
    expect(store.get('third')).toBeDefined();
    expect(store.size).toBe(2);
  });

  it('does not evict when updating existing key', () => {
    const store = makeBucketStore({ maxSize: 2 });
    store.set('a', makeBucket({ value: 1 }));
    store.set('b', makeBucket({ value: 2 }));
    store.set('a', makeBucket({ value: 10 }));

    expect(store.size).toBe(2);
    expect(store.get('a')?.value).toBe(10);
    expect(store.get('b')?.value).toBe(2);
  });

  it('keeps an empty-string-keyed oldest entry on eviction (falsy guard)', () => {
    const store = makeBucketStore({ maxSize: 2 });
    store.set('', makeBucket({ value: 0 }));
    store.set('b', makeBucket({ value: 2 }));
    store.set('c', makeBucket({ value: 3 }));

    expect(store.size).toBe(3);
    expect(store.get('')).toBeDefined();
    expect(store.get('b')).toBeDefined();
    expect(store.get('c')).toBeDefined();
  });

  it('sweep removes expired entries after interval', () => {
    const store = makeBucketStore({ maxSize: 100, sweepIntervalMs: 1000 });
    const now = Date.now();

    store.set('short-lived', makeBucket({ value: 1, expiresAt: now + 500 }));
    store.set('long-lived', makeBucket({ value: 2, expiresAt: now + 5000 }));

    jest.advanceTimersByTime(1001);

    expect(store.get('short-lived')).toBeUndefined();
    expect(store.get('long-lived')).toBeDefined();
    expect(store.size).toBe(1);
  });

  it('sweep stops itself when all entries are expired (size===0 branch)', () => {
    const setSpy = jest.spyOn(global, 'setInterval');
    const clearSpy = jest.spyOn(global, 'clearInterval');
    const store = makeBucketStore({ maxSize: 100, sweepIntervalMs: 1000 });
    const now = Date.now();

    store.set('a', makeBucket({ value: 1, expiresAt: now + 500 }));
    expect(setSpy).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1001);

    expect(store.size).toBe(0);
    expect(clearSpy).toHaveBeenCalledTimes(1);

    store.set('b', makeBucket({ value: 2, expiresAt: now + 10_000 }));
    expect(setSpy).toHaveBeenCalledTimes(2);
  });

  it('keeps the sweep timer alive when entries remain after a sweep tick', () => {
    const clearSpy = jest.spyOn(global, 'clearInterval');
    const store = makeBucketStore({ maxSize: 100, sweepIntervalMs: 1000 });
    const now = Date.now();

    store.set('expired', makeBucket({ value: 1, expiresAt: now + 500 }));
    store.set('alive', makeBucket({ value: 2, expiresAt: now + 10_000 }));

    jest.advanceTimersByTime(1001);

    expect(store.size).toBe(1);
    expect(store.get('alive')).toBeDefined();
    expect(clearSpy).not.toHaveBeenCalled();

    store.set('expired2', makeBucket({ value: 3, expiresAt: now + 1200 }));
    jest.advanceTimersByTime(1001);
    expect(store.get('expired2')).toBeUndefined();
    expect(store.get('alive')).toBeDefined();
  });

  it('does not start duplicate sweep timers across multiple sets', () => {
    const setSpy = jest.spyOn(global, 'setInterval');
    const store = makeBucketStore({ maxSize: 100, sweepIntervalMs: 1000 });

    store.set('a', makeBucket({ value: 1, expiresAt: Date.now() + 5000 }));
    store.set('b', makeBucket({ value: 2, expiresAt: Date.now() + 5000 }));
    store.set('c', makeBucket({ value: 3, expiresAt: Date.now() + 5000 }));

    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(store.size).toBe(3);

    store.clear();
  });

  it('stopSweep prevents further sweeping', () => {
    const store = makeBucketStore({ maxSize: 100, sweepIntervalMs: 1000 });
    const now = Date.now();

    store.set('a', makeBucket({ value: 1, expiresAt: now + 500 }));
    store.stopSweep();

    jest.advanceTimersByTime(2000);

    expect(store.get('a')).toBeDefined();
  });

  it('stopSweep is a no-op when no timer is running (no clearInterval call)', () => {
    const clearSpy = jest.spyOn(global, 'clearInterval');
    const store = makeBucketStore();

    store.stopSweep();
    store.stopSweep();

    expect(clearSpy).not.toHaveBeenCalled();
  });

  it('uses 5-minute default sweep interval (300_000 ms)', () => {
    const store = makeBucketStore();
    const now = Date.now();
    store.set('e', makeBucket({ value: 1, expiresAt: now - 1 }));

    jest.advanceTimersByTime(1000);
    expect(store.get('e')).toBeDefined();

    jest.advanceTimersByTime(5 * 60 * 1000);
    expect(store.get('e')).toBeUndefined();
  });

  it('calls unref() on the sweep timer so it does not keep the event loop alive', () => {
    const setSpy = jest.spyOn(global, 'setInterval');
    const store = makeBucketStore({ maxSize: 100, sweepIntervalMs: 1000 });

    store.set('a', makeBucket({ value: 1, expiresAt: Date.now() + 5000 }));

    expect(setSpy).toHaveBeenCalledTimes(1);
    const timer = setSpy.mock.results[0].value as { unref?: () => void };
    expect(typeof timer.unref).toBe('function');

    store.clear();
  });

  it('invokes unref exactly once on the timer returned by setInterval', () => {
    const unrefStub = jest.fn();
    const realSetInterval = global.setInterval;
    const setSpy = jest.spyOn(global, 'setInterval').mockImplementation(((
      handler: (...args: unknown[]) => void,
      ms?: number,
      ...args: unknown[]
    ) => {
      const t = realSetInterval(handler, ms, ...args) as unknown as {
        unref: () => void;
      };
      t.unref = unrefStub;
      return t as unknown as ReturnType<typeof setInterval>;
    }) as typeof setInterval);

    const store = makeBucketStore({ maxSize: 100, sweepIntervalMs: 1000 });
    store.set('a', makeBucket({ value: 1, expiresAt: Date.now() + 5000 }));

    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(unrefStub).toHaveBeenCalledTimes(1);

    store.clear();
  });

  it('factory accepts a custom isExpired predicate', () => {
    let predicateCalls = 0;
    const store = makeBucketStore({
      maxSize: 10,
      sweepIntervalMs: 1000,
      isExpired: (entry: TestBucket, now: number) => {
        predicateCalls += 1;
        return entry.expiresAt + 100 <= now;
      },
    });

    store.set('a', makeBucket({ value: 1, expiresAt: Date.now() + 500 }));
    jest.advanceTimersByTime(1001);

    expect(predicateCalls).toBeGreaterThanOrEqual(1);
    store.clear();
  });
});
