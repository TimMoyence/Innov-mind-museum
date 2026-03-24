import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { OfflineQueue } from '../features/chat/application/offlineQueue';

describe('OfflineQueue', () => {
  let queue: OfflineQueue;

  beforeEach(() => {
    queue = new OfflineQueue();
  });

  it('enqueue adds an element with unique id, createdAt, and retryCount=0', () => {
    const entry = queue.enqueue({ sessionId: 's1', text: 'hello' });

    assert.ok(entry.id.startsWith('offline-'), 'id should start with "offline-"');
    assert.equal(typeof entry.createdAt, 'number');
    assert.equal(entry.retryCount, 0);
    assert.equal(entry.sessionId, 's1');
    assert.equal(entry.text, 'hello');
  });

  it('enqueue generates unique ids for each entry', () => {
    const a = queue.enqueue({ sessionId: 's1', text: 'a' });
    const b = queue.enqueue({ sessionId: 's1', text: 'b' });

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
    queue.subscribe(() => { callCount++; });

    queue.enqueue({ sessionId: 's1', text: 'a' });
    assert.equal(callCount, 1);

    queue.enqueue({ sessionId: 's1', text: 'b' });
    assert.equal(callCount, 2);
  });

  it('subscribe: listener is notified after dequeue', () => {
    queue.enqueue({ sessionId: 's1', text: 'a' });

    let callCount = 0;
    queue.subscribe(() => { callCount++; });

    queue.dequeue();
    assert.equal(callCount, 1);
  });

  it('subscribe: listener is notified after remove', () => {
    const entry = queue.enqueue({ sessionId: 's1', text: 'a' });

    let callCount = 0;
    queue.subscribe(() => { callCount++; });

    queue.remove(entry.id);
    assert.equal(callCount, 1);
  });

  it('subscribe returns an unsubscribe function', () => {
    let callCount = 0;
    const unsub = queue.subscribe(() => { callCount++; });

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
});
