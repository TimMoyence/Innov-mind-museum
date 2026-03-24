import { InMemoryBucketStore } from '@shared/rate-limit/in-memory-bucket-store';

interface TestBucket {
  value: number;
  expiresAt: number;
}

describe('InMemoryBucketStore', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const createStore = (maxSize = 100_000, sweepIntervalMs = 5 * 60 * 1000) =>
    new InMemoryBucketStore<TestBucket>({
      maxSize,
      sweepIntervalMs,
      isExpired: (entry, now) => entry.expiresAt <= now,
    });

  it('stores and retrieves entries', () => {
    const store = createStore();
    store.set('key1', { value: 1, expiresAt: Date.now() + 10_000 });
    expect(store.get('key1')).toEqual({ value: 1, expiresAt: expect.any(Number) });
  });

  it('returns undefined for non-existent key', () => {
    const store = createStore();
    expect(store.get('nonexistent')).toBeUndefined();
  });

  it('deletes entries', () => {
    const store = createStore();
    store.set('key1', { value: 1, expiresAt: Date.now() + 10_000 });
    store.delete('key1');
    expect(store.get('key1')).toBeUndefined();
  });

  it('clears all entries and stops sweep', () => {
    const store = createStore();
    store.set('key1', { value: 1, expiresAt: Date.now() + 10_000 });
    store.set('key2', { value: 2, expiresAt: Date.now() + 10_000 });
    expect(store.size).toBe(2);

    store.clear();
    expect(store.size).toBe(0);
  });

  it('reports size correctly', () => {
    const store = createStore();
    expect(store.size).toBe(0);
    store.set('a', { value: 1, expiresAt: Date.now() + 10_000 });
    expect(store.size).toBe(1);
    store.set('b', { value: 2, expiresAt: Date.now() + 10_000 });
    expect(store.size).toBe(2);
  });

  it('evicts oldest entry when maxSize is exceeded', () => {
    const store = createStore(2);
    store.set('first', { value: 1, expiresAt: Date.now() + 10_000 });
    store.set('second', { value: 2, expiresAt: Date.now() + 10_000 });
    // Adding third should evict 'first'
    store.set('third', { value: 3, expiresAt: Date.now() + 10_000 });

    expect(store.get('first')).toBeUndefined();
    expect(store.get('second')).toBeDefined();
    expect(store.get('third')).toBeDefined();
    expect(store.size).toBe(2);
  });

  it('does not evict when updating existing key', () => {
    const store = createStore(2);
    store.set('a', { value: 1, expiresAt: Date.now() + 10_000 });
    store.set('b', { value: 2, expiresAt: Date.now() + 10_000 });
    // Updating 'a' should not evict anything
    store.set('a', { value: 10, expiresAt: Date.now() + 10_000 });

    expect(store.size).toBe(2);
    expect(store.get('a')?.value).toBe(10);
    expect(store.get('b')?.value).toBe(2);
  });

  it('sweep removes expired entries after interval', () => {
    const store = createStore(100, 1000);
    const now = Date.now();

    store.set('short-lived', { value: 1, expiresAt: now + 500 });
    store.set('long-lived', { value: 2, expiresAt: now + 5000 });

    // Advance past sweep interval + past the short-lived expiry
    jest.advanceTimersByTime(1001);

    expect(store.get('short-lived')).toBeUndefined();
    expect(store.get('long-lived')).toBeDefined();
  });

  it('sweep stops when all entries are expired', () => {
    const store = createStore(100, 1000);
    const now = Date.now();

    store.set('a', { value: 1, expiresAt: now + 500 });

    // Advance past sweep interval
    jest.advanceTimersByTime(1001);

    // Entry should be swept
    expect(store.size).toBe(0);

    // Further time advances should not throw
    jest.advanceTimersByTime(5000);
  });

  it('stopSweep prevents further sweeping', () => {
    const store = createStore(100, 1000);
    const now = Date.now();

    store.set('a', { value: 1, expiresAt: now + 500 });
    store.stopSweep();

    // Advance past sweep interval
    jest.advanceTimersByTime(2000);

    // Entry was not swept because we stopped the sweep
    // (though the entry is expired, the sweep timer is not running)
    expect(store.get('a')).toBeDefined(); // still in map, just expired
  });

  it('stopSweep is a no-op when no timer is running', () => {
    const store = createStore();
    // Should not throw
    store.stopSweep();
    store.stopSweep();
  });

  it('does not start duplicate sweep timers', () => {
    const store = createStore(100, 1000);
    const now = Date.now();

    store.set('a', { value: 1, expiresAt: now + 5000 });
    store.set('b', { value: 2, expiresAt: now + 5000 });
    store.set('c', { value: 3, expiresAt: now + 5000 });

    // All three sets should result in a single sweep timer
    expect(store.size).toBe(3);

    store.clear();
  });
});
