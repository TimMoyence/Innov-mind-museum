import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { OfflineQueue } from '../features/chat/application/offlineQueue';
import type { QueueStorage } from '../features/chat/application/offlineQueue';

describe('OfflineQueue', () => {
  let queue: OfflineQueue;

  beforeEach(() => {
    queue = new OfflineQueue();
  });

  it('enqueue adds an element with unique id, createdAt, and retryCount=0', () => {
    const entry = queue.enqueue({ sessionId: 's1', text: 'hello' });
    assert.ok(entry !== null, 'enqueue should return a message');

    assert.ok(entry.id.startsWith('offline-'), 'id should start with "offline-"');
    assert.equal(typeof entry.createdAt, 'number');
    assert.equal(entry.retryCount, 0);
    assert.equal(entry.sessionId, 's1');
    assert.equal(entry.text, 'hello');
  });

  it('enqueue generates unique ids for each entry', () => {
    const a = queue.enqueue({ sessionId: 's1', text: 'a' });
    const b = queue.enqueue({ sessionId: 's1', text: 'b' });
    assert.ok(a !== null && b !== null, 'both enqueues should succeed');

    assert.notEqual(a.id, b.id);
  });

  it('dequeue returns the first element (FIFO) and removes it', () => {
    queue.enqueue({ sessionId: 's1', text: 'first' });
    queue.enqueue({ sessionId: 's1', text: 'second' });

    const item = queue.dequeue();
    assert.equal(item?.text, 'first');
    assert.equal(queue.size(), 1);
  });

  it('dequeue on empty queue returns undefined', () => {
    const item = queue.dequeue();
    assert.equal(item, undefined);
  });

  it('peek returns the first element without removing it', () => {
    queue.enqueue({ sessionId: 's1', text: 'peeked' });

    const item = queue.peek();
    assert.equal(item?.text, 'peeked');
    assert.equal(queue.size(), 1, 'peek should not remove the element');
  });

  it('peek on empty queue returns undefined', () => {
    assert.equal(queue.peek(), undefined);
  });

  it('size returns the number of elements', () => {
    assert.equal(queue.size(), 0);
    queue.enqueue({ sessionId: 's1', text: 'a' });
    assert.equal(queue.size(), 1);
    queue.enqueue({ sessionId: 's1', text: 'b' });
    assert.equal(queue.size(), 2);
  });

  it('isEmpty returns true when queue is empty', () => {
    assert.equal(queue.isEmpty(), true);
  });

  it('isEmpty returns false when queue has elements', () => {
    queue.enqueue({ sessionId: 's1', text: 'x' });
    assert.equal(queue.isEmpty(), false);
  });

  it('remove removes an element by id', () => {
    const entry = queue.enqueue({ sessionId: 's1', text: 'to-remove' });
    assert.ok(entry !== null);
    queue.enqueue({ sessionId: 's1', text: 'stays' });

    queue.remove(entry.id);

    assert.equal(queue.size(), 1);
    assert.equal(queue.peek()?.text, 'stays');
  });

  it('remove on non-existent id does not throw', () => {
    queue.enqueue({ sessionId: 's1', text: 'a' });
    queue.remove('non-existent-id');
    assert.equal(queue.size(), 1);
  });

  it('incrementRetry increments the retryCount of an element', () => {
    const entry = queue.enqueue({ sessionId: 's1', text: 'retry-me' });
    assert.ok(entry !== null);

    queue.incrementRetry(entry.id);
    assert.equal(queue.peek()?.retryCount, 1);

    queue.incrementRetry(entry.id);
    assert.equal(queue.peek()?.retryCount, 2);
  });

  it('incrementRetry on non-existent id does nothing', () => {
    queue.enqueue({ sessionId: 's1', text: 'a' });
    queue.incrementRetry('non-existent-id');
    assert.equal(queue.peek()?.retryCount, 0);
  });

  it('subscribe: listener is notified after enqueue', () => {
    let callCount = 0;
    queue.subscribe(() => {
      callCount++;
    });

    queue.enqueue({ sessionId: 's1', text: 'a' });
    assert.equal(callCount, 1);

    queue.enqueue({ sessionId: 's1', text: 'b' });
    assert.equal(callCount, 2);
  });

  it('subscribe: listener is notified after dequeue', () => {
    queue.enqueue({ sessionId: 's1', text: 'a' });

    let callCount = 0;
    queue.subscribe(() => {
      callCount++;
    });

    queue.dequeue();
    assert.equal(callCount, 1);
  });

  it('subscribe: listener is notified after remove', () => {
    const entry = queue.enqueue({ sessionId: 's1', text: 'a' });
    assert.ok(entry !== null);

    let callCount = 0;
    queue.subscribe(() => {
      callCount++;
    });

    queue.remove(entry.id);
    assert.equal(callCount, 1);
  });

  it('subscribe returns an unsubscribe function', () => {
    let callCount = 0;
    const unsub = queue.subscribe(() => {
      callCount++;
    });

    queue.enqueue({ sessionId: 's1', text: 'a' });
    assert.equal(callCount, 1);

    unsub();
    queue.enqueue({ sessionId: 's1', text: 'b' });
    assert.equal(callCount, 1, 'listener should not be called after unsubscribe');
  });

  it('getAll returns a snapshot of the queue', () => {
    queue.enqueue({ sessionId: 's1', text: 'a' });
    queue.enqueue({ sessionId: 's1', text: 'b' });

    const all = queue.getAll();
    assert.equal(all.length, 2);
    assert.equal(all[0].text, 'a');
    assert.equal(all[1].text, 'b');
  });

  it('getAll snapshot is not affected by subsequent mutations', () => {
    queue.enqueue({ sessionId: 's1', text: 'a' });
    const snapshot = queue.getAll();

    queue.enqueue({ sessionId: 's1', text: 'b' });
    assert.equal(snapshot.length, 1, 'snapshot should be frozen at capture time');
  });

  describe('maxQueueSize', () => {
    it('enqueue returns null when queue is full', () => {
      const smallQueue = new OfflineQueue({ maxQueueSize: 3 });

      const a = smallQueue.enqueue({ sessionId: 's1', text: 'a' });
      const b = smallQueue.enqueue({ sessionId: 's1', text: 'b' });
      const c = smallQueue.enqueue({ sessionId: 's1', text: 'c' });

      assert.ok(a !== null, 'first enqueue should succeed');
      assert.ok(b !== null, 'second enqueue should succeed');
      assert.ok(c !== null, 'third enqueue should succeed');
      assert.equal(smallQueue.size(), 3);

      const d = smallQueue.enqueue({ sessionId: 's1', text: 'd' });
      assert.equal(d, null, 'enqueue should return null when queue is full');
      assert.equal(smallQueue.size(), 3, 'queue size should remain at max');
    });

    it('enqueue succeeds again after dequeue frees a slot', () => {
      const smallQueue = new OfflineQueue({ maxQueueSize: 2 });

      smallQueue.enqueue({ sessionId: 's1', text: 'a' });
      smallQueue.enqueue({ sessionId: 's1', text: 'b' });

      assert.equal(smallQueue.enqueue({ sessionId: 's1', text: 'c' }), null);

      smallQueue.dequeue();
      const result = smallQueue.enqueue({ sessionId: 's1', text: 'c' });
      assert.ok(result !== null, 'enqueue should succeed after dequeue');
      assert.equal(smallQueue.size(), 2);
    });

    it('defaults to 50 when maxQueueSize is not specified', () => {
      const defaultQueue = new OfflineQueue();
      for (let i = 0; i < 50; i++) {
        assert.ok(
          defaultQueue.enqueue({ sessionId: 's1', text: `msg-${i}` }) !== null,
          `enqueue #${i} should succeed`,
        );
      }
      assert.equal(
        defaultQueue.enqueue({ sessionId: 's1', text: 'overflow' }),
        null,
        'enqueue #51 should return null',
      );
    });
  });

  describe('maxAgeMs / hydrate eviction', () => {
    it('hydrate filters out messages older than maxAgeMs', async () => {
      const now = Date.now();
      const stored = JSON.stringify([
        { id: 'old-1', sessionId: 's1', text: 'old', createdAt: now - 90_000, retryCount: 0 },
        { id: 'fresh-1', sessionId: 's1', text: 'fresh', createdAt: now - 10_000, retryCount: 0 },
      ]);

      const storage: QueueStorage = {
        getItem: () => Promise.resolve(stored),
        setItem: () => Promise.resolve(),
      };

      const q = new OfflineQueue({ storage, maxAgeMs: 60_000 });
      await q.hydrate();

      assert.equal(q.size(), 1, 'only fresh message should survive hydration');
      assert.equal(q.peek()?.id, 'fresh-1');
    });

    it('hydrate keeps all messages when none are expired', async () => {
      const now = Date.now();
      const stored = JSON.stringify([
        { id: 'a', sessionId: 's1', text: 'a', createdAt: now - 1_000, retryCount: 0 },
        { id: 'b', sessionId: 's1', text: 'b', createdAt: now - 2_000, retryCount: 0 },
      ]);

      const storage: QueueStorage = {
        getItem: () => Promise.resolve(stored),
        setItem: () => Promise.resolve(),
      };

      const q = new OfflineQueue({ storage, maxAgeMs: 60_000 });
      await q.hydrate();

      assert.equal(q.size(), 2);
    });

    it('hydrate calls onEvict with expired messages', async () => {
      const now = Date.now();
      const stored = JSON.stringify([
        {
          id: 'old-1',
          sessionId: 's1',
          text: 'old',
          imageUri: 'file:///tmp/img.jpg',
          createdAt: now - 90_000,
          retryCount: 0,
        },
        { id: 'fresh-1', sessionId: 's1', text: 'fresh', createdAt: now - 10_000, retryCount: 0 },
      ]);

      const storage: QueueStorage = {
        getItem: () => Promise.resolve(stored),
        setItem: () => Promise.resolve(),
      };

      const evicted: { id: string; imageUri?: string }[] = [];
      const q = new OfflineQueue({
        storage,
        maxAgeMs: 60_000,
        onEvict: (msgs) => {
          evicted.push(...msgs);
        },
      });
      await q.hydrate();

      assert.equal(evicted.length, 1);
      assert.equal(evicted[0].id, 'old-1');
      assert.equal(evicted[0].imageUri, 'file:///tmp/img.jpg');
    });

    it('hydrate does not call onEvict when nothing is expired', async () => {
      const now = Date.now();
      const stored = JSON.stringify([
        { id: 'a', sessionId: 's1', text: 'a', createdAt: now - 1_000, retryCount: 0 },
      ]);

      const storage: QueueStorage = {
        getItem: () => Promise.resolve(stored),
        setItem: () => Promise.resolve(),
      };

      let evictCalled = false;
      const q = new OfflineQueue({
        storage,
        maxAgeMs: 60_000,
        onEvict: () => {
          evictCalled = true;
        },
      });
      await q.hydrate();

      assert.equal(evictCalled, false, 'onEvict should not be called when nothing expired');
    });
  });

  describe('prune', () => {
    it('removes messages older than maxAgeMs', () => {
      const q = new OfflineQueue({ maxQueueSize: 100, maxAgeMs: 60_000 });

      // Manually insert messages with old timestamps
      const entry = q.enqueue({ sessionId: 's1', text: 'recent' });
      assert.ok(entry !== null);

      // Access internal queue via getAll + remove + re-add with old timestamp is complex,
      // so we test prune indirectly: enqueue a message, then prune with a very short maxAgeMs
      const shortLived = new OfflineQueue({ maxQueueSize: 100, maxAgeMs: 1 });
      shortLived.enqueue({ sessionId: 's1', text: 'will-expire' });

      // Wait a tiny bit so the message is older than 1ms
      const start = Date.now();
      while (Date.now() - start < 5) {
        // busy-wait to ensure at least 1ms passes
      }

      shortLived.prune();
      assert.equal(shortLived.size(), 0, 'expired message should be pruned');
    });

    it('prune does not remove fresh messages', () => {
      const q = new OfflineQueue({ maxQueueSize: 100, maxAgeMs: 60_000 });
      q.enqueue({ sessionId: 's1', text: 'fresh' });

      q.prune();
      assert.equal(q.size(), 1, 'fresh message should survive prune');
    });

    it('prune notifies listeners when messages are removed', () => {
      const q = new OfflineQueue({ maxQueueSize: 100, maxAgeMs: 1 });
      q.enqueue({ sessionId: 's1', text: 'a' });

      const start = Date.now();
      while (Date.now() - start < 5) {
        // busy-wait
      }

      let notified = false;
      q.subscribe(() => {
        notified = true;
      });

      q.prune();
      assert.equal(notified, true, 'listener should be notified on prune');
    });

    it('prune does not notify if nothing was removed', () => {
      const q = new OfflineQueue({ maxQueueSize: 100, maxAgeMs: 60_000 });
      q.enqueue({ sessionId: 's1', text: 'a' });

      let notified = false;
      q.subscribe(() => {
        notified = true;
      });

      q.prune();
      assert.equal(notified, false, 'listener should not be notified when nothing pruned');
    });

    it('prune calls onEvict with expired messages', () => {
      const evicted: { id: string; imageUri?: string }[] = [];
      const q = new OfflineQueue({
        maxQueueSize: 100,
        maxAgeMs: 1,
        onEvict: (msgs) => {
          evicted.push(...msgs);
        },
      });
      q.enqueue({ sessionId: 's1', text: 'will-expire', imageUri: 'file:///tmp/photo.jpg' });

      const start = Date.now();
      while (Date.now() - start < 5) {
        // busy-wait
      }

      q.prune();
      assert.equal(evicted.length, 1, 'onEvict should receive the pruned message');
      assert.equal(evicted[0].imageUri, 'file:///tmp/photo.jpg');
    });

    it('prune does not call onEvict if nothing was pruned', () => {
      let evictCalled = false;
      const q = new OfflineQueue({
        maxQueueSize: 100,
        maxAgeMs: 60_000,
        onEvict: () => {
          evictCalled = true;
        },
      });
      q.enqueue({ sessionId: 's1', text: 'fresh' });

      q.prune();
      assert.equal(evictCalled, false, 'onEvict should not be called when nothing pruned');
    });
  });
});
