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
    expect(shouldFail(b)).toBe(true);
    expect(shouldFail(b)).toBe(false);
    expect(shouldFail(a)).toBe(true);
    expect(shouldFail(a)).toBe(false);
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
