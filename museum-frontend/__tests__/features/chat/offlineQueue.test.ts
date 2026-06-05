/**
 * RED (W1-L1-10) — M3 OfflineQueue full / FIFO / maxAge / prune / corrupt-JSON /
 * getAll-after-hydrate snapshot-init gap (spec R4).
 *
 * Exercises the REAL `OfflineQueue` against a fake `QueueStorage`, building queued
 * entries via the DRY `makeQueuedMessage` factory. Pins the regression where
 * `getAll()` returns `this.snapshot` (mutated only by `notify()`, NOT by
 * `hydrate()` when storage is empty) → `[]` after a hydrate that never notified
 * (`offlineQueue.ts:30/162`). Both constructor forms (legacy `QueueStorage`,
 * options object) are covered.
 *
 * Fails RED because the `makeQueuedMessage` factory does not exist yet.
 */
import { OfflineQueue, type QueuedMessage } from '@/features/chat/application/offlineQueue';
import { makeQueuedMessage } from '@/__tests__/helpers/factories';
import { nonNull } from '@/__tests__/helpers/nonNull';

const STORAGE_KEY = 'musaium.offline.queue';

/** In-memory fake of the `QueueStorage` port (single backing key). */
class FakeQueueStorage {
  private store = new Map<string, string>();
  getItem = jest.fn(async (key: string): Promise<string | null> => this.store.get(key) ?? null);
  setItem = jest.fn(async (key: string, value: string): Promise<void> => {
    this.store.set(key, value);
  });
  seed(value: string): void {
    this.store.set(STORAGE_KEY, value);
  }
}

describe('M3 — OfflineQueue', () => {
  it('rejects enqueue when full (maxQueueSize reached → null)', () => {
    const queue = new OfflineQueue({ maxQueueSize: 2 });

    expect(queue.enqueue({ sessionId: 's', text: 'one' })).not.toBeNull();
    expect(queue.enqueue({ sessionId: 's', text: 'two' })).not.toBeNull();
    expect(queue.enqueue({ sessionId: 's', text: 'three' })).toBeNull();
    expect(queue.size()).toBe(2);
  });

  it('dequeues in FIFO order', () => {
    const queue = new OfflineQueue();
    queue.enqueue({ sessionId: 's', text: 'first' });
    queue.enqueue({ sessionId: 's', text: 'second' });

    expect(queue.dequeue()?.text).toBe('first');
    expect(queue.dequeue()?.text).toBe('second');
    expect(queue.dequeue()).toBeUndefined();
  });

  it('drops entries older than maxAge during hydrate and calls onEvict', async () => {
    const storage = new FakeQueueStorage();
    const onEvict = jest.fn<undefined, [QueuedMessage[]]>();
    const now = Date.now();

    const fresh = makeQueuedMessage({ id: 'fresh', createdAt: now });
    const stale = makeQueuedMessage({ id: 'stale', createdAt: now - 48 * 60 * 60 * 1000 });
    storage.seed(JSON.stringify([fresh, stale]));

    const queue = new OfflineQueue({
      storage,
      maxAgeMs: 24 * 60 * 60 * 1000,
      onEvict,
    });
    await queue.hydrate();

    expect(queue.size()).toBe(1);
    expect(queue.peek()?.id).toBe('fresh');
    expect(onEvict).toHaveBeenCalledTimes(1);
    expect(nonNull(onEvict.mock.calls[0])[0].map((m) => m.id)).toEqual(['stale']);
  });

  it('prune() removes aged entries and notifies onEvict', () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(0);
      const onEvict = jest.fn<undefined, [QueuedMessage[]]>();
      const queue = new OfflineQueue({ maxAgeMs: 1000, onEvict });

      const aged = queue.enqueue({ sessionId: 's', text: 'will-age' });
      expect(aged).not.toBeNull();

      // Advance the system clock beyond maxAge so the entry is now stale.
      jest.setSystemTime(5000);
      const recent = queue.enqueue({ sessionId: 's', text: 'recent' });
      expect(recent).not.toBeNull();

      queue.prune();

      expect(queue.size()).toBe(1);
      expect(queue.peek()?.text).toBe('recent');
      expect(onEvict).toHaveBeenCalledTimes(1);
      expect(nonNull(onEvict.mock.calls[0])[0].map((m) => m.id)).toEqual([aged?.id]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('hydrate() with corrupt JSON starts empty and never throws', async () => {
    const storage = new FakeQueueStorage();
    storage.seed('{not-valid-json');

    const queue = new OfflineQueue({ storage });
    await expect(queue.hydrate()).resolves.toBeUndefined();

    expect(queue.size()).toBe(0);
    expect(queue.getAll()).toEqual([]);
  });

  it('getAll() returns [] after a hydrate that never notified (snapshot-init regression)', async () => {
    // Empty storage → hydrate returns early WITHOUT calling notify(), so the
    // snapshot remains its initial []. getAll() reads the snapshot, not the queue.
    const storage = new FakeQueueStorage();

    const queue = new OfflineQueue({ storage });
    await queue.hydrate();

    expect(queue.getAll()).toEqual([]);
  });

  it('getAll() reflects the snapshot only after a notifying mutation', () => {
    const queue = new OfflineQueue();

    expect(queue.getAll()).toEqual([]);
    const entry = queue.enqueue({ sessionId: 's', text: 'now-visible' });

    expect(entry).not.toBeNull();
    expect(queue.getAll().map((m) => m.id)).toEqual([entry?.id]);
  });

  it('supports the legacy constructor(storage) form', async () => {
    const storage = new FakeQueueStorage();
    const fresh = makeQueuedMessage({ id: 'legacy', createdAt: Date.now() });
    storage.seed(JSON.stringify([fresh]));

    const queue = new OfflineQueue(storage);
    await queue.hydrate();

    expect(queue.size()).toBe(1);
    expect(queue.peek()?.id).toBe('legacy');
  });

  it('supports the options-object constructor form', () => {
    const queue = new OfflineQueue({ maxQueueSize: 1 });

    expect(queue.enqueue({ sessionId: 's', text: 'a' })).not.toBeNull();
    expect(queue.enqueue({ sessionId: 's', text: 'b' })).toBeNull();
  });
});
