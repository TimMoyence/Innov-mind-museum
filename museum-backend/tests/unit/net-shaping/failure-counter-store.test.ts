/**
 * W2-03 (RED) — failure-counter store unit.
 *
 * spec.md §EARS R2: WHEN X-Net-Fail-Count:N THE mw SHALL fail the next N
 *   requests then succeed, keyed on sessionId+userId+path (a Zod-400 must NOT
 *   burn the key — but that ordering concern lives in the middleware; here we
 *   test the pure store contract).
 * design.md §Architecture: `failure-counter.store.ts` = in-memory Map
 *   (single-instance CI). `failNext(N)` keyed; `shouldFail(key)` decrements;
 *   distinct keys independent; `reset()` clears.
 *
 * RED state: `@shared/net-shaping/failure-counter.store` does not exist yet →
 * the import throws (module not found) → every assertion fails.
 *
 * lib-docs: none — in-memory Map, stdlib only. No inline test entities; the
 *   store keys are plain composite strings, not domain entities.
 *
 * Frozen-test invariant: byte-immutable once manifested (phase=green).
 */
import {
  failureCounterKey,
  failNext,
  shouldFail,
  resetFailureCounters,
} from '@shared/net-shaping/failure-counter.store';

describe('failure-counter store (W2-03)', () => {
  afterEach(() => {
    resetFailureCounters();
  });

  it('failureCounterKey composes sessionId + userId + path deterministically', () => {
    const a = failureCounterKey({ sessionId: 's1', userId: 'u1', path: '/api/x' });
    const b = failureCounterKey({ sessionId: 's1', userId: 'u1', path: '/api/x' });
    const c = failureCounterKey({ sessionId: 's1', userId: 'u1', path: '/api/y' });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('treats anonymous (undefined userId) and missing sessionId as stable key components', () => {
    const anon1 = failureCounterKey({ sessionId: undefined, userId: undefined, path: '/api/z' });
    const anon2 = failureCounterKey({ sessionId: undefined, userId: undefined, path: '/api/z' });
    expect(anon1).toBe(anon2);
    // Different path → different anon key (no collapse into a single anon bucket).
    const anon3 = failureCounterKey({ sessionId: undefined, userId: undefined, path: '/api/w' });
    expect(anon1).not.toBe(anon3);
  });

  it('failNext(N) → shouldFail returns true N times then false', () => {
    const key = failureCounterKey({ sessionId: 's1', userId: 'u1', path: '/api/x' });
    failNext(key, 3);
    expect(shouldFail(key)).toBe(true);
    expect(shouldFail(key)).toBe(true);
    expect(shouldFail(key)).toBe(true);
    expect(shouldFail(key)).toBe(false);
    expect(shouldFail(key)).toBe(false);
  });

  it('shouldFail returns false for a key that was never armed', () => {
    const key = failureCounterKey({ sessionId: 's9', userId: 'u9', path: '/api/never' });
    expect(shouldFail(key)).toBe(false);
  });

  it('failNext(0) arms nothing — shouldFail stays false', () => {
    const key = failureCounterKey({ sessionId: 's1', userId: 'u1', path: '/api/x' });
    failNext(key, 0);
    expect(shouldFail(key)).toBe(false);
  });

  it('distinct keys are independent — consuming one does not affect another', () => {
    const a = failureCounterKey({ sessionId: 'sA', userId: 'uA', path: '/api/a' });
    const b = failureCounterKey({ sessionId: 'sB', userId: 'uB', path: '/api/b' });
    failNext(a, 2);
    failNext(b, 1);

    expect(shouldFail(a)).toBe(true);
    expect(shouldFail(b)).toBe(true); // b consumed independently
    expect(shouldFail(b)).toBe(false); // b exhausted
    expect(shouldFail(a)).toBe(true); // a still has 1 left
    expect(shouldFail(a)).toBe(false); // a exhausted
  });

  it('failNext re-arms a key to the new count (latest call wins, not additive)', () => {
    const key = failureCounterKey({ sessionId: 's1', userId: 'u1', path: '/api/x' });
    failNext(key, 1);
    failNext(key, 2);
    expect(shouldFail(key)).toBe(true);
    expect(shouldFail(key)).toBe(true);
    expect(shouldFail(key)).toBe(false);
  });

  it('resetFailureCounters() clears every armed key', () => {
    const a = failureCounterKey({ sessionId: 'sA', userId: 'uA', path: '/api/a' });
    const b = failureCounterKey({ sessionId: 'sB', userId: 'uB', path: '/api/b' });
    failNext(a, 5);
    failNext(b, 5);
    resetFailureCounters();
    expect(shouldFail(a)).toBe(false);
    expect(shouldFail(b)).toBe(false);
  });
});
