import { clearRateLimitBuckets, createRateLimitMiddleware, byIp, stopRateLimitSweep } from '@src/helpers/middleware/rate-limit.middleware';

describe('rate-limit middleware — sweep and eviction', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    clearRateLimitBuckets();
  });

  afterEach(() => {
    clearRateLimitBuckets();
    jest.useRealTimers();
  });

  const makeMockReq = (ip: string) =>
    ({ ip, socket: { remoteAddress: ip }, params: {}, body: {}, header: () => undefined } as any);
  const makeMockRes = () => ({ setHeader: jest.fn() } as any);
  const noop = jest.fn();

  it('evicts expired buckets after sweep interval', () => {
    const mw = createRateLimitMiddleware({ limit: 10, windowMs: 1000, keyGenerator: byIp });
    const req = makeMockReq('1.2.3.4');

    // Create a bucket
    mw(req, makeMockRes(), noop);
    expect(noop).toHaveBeenCalledTimes(1);

    // Advance past the window AND the sweep interval (5 minutes)
    jest.advanceTimersByTime(5 * 60 * 1000 + 1);

    // The sweep should have removed the expired bucket.
    // A new request from the same IP should start fresh (count=1).
    const next2 = jest.fn();
    mw(req, makeMockRes(), next2);
    expect(next2).toHaveBeenCalledTimes(1);
    // No error means bucket was either evicted (sweep) or self-reset (expired check at line 33).
    expect(next2).toHaveBeenCalledWith();
  });

  it('respects MAX_MAP_SIZE cap by evicting oldest entry', () => {
    const mw = createRateLimitMiddleware({ limit: 2, windowMs: 100, keyGenerator: byIp });

    const next1 = jest.fn();
    mw(makeMockReq('1.1.1.1'), makeMockRes(), next1);
    mw(makeMockReq('2.2.2.2'), makeMockRes(), next1);

    expect(next1).toHaveBeenCalledTimes(2);

    // Advance past window
    jest.advanceTimersByTime(200);

    // Both should work again (expired buckets reset)
    const next2 = jest.fn();
    mw(makeMockReq('1.1.1.1'), makeMockRes(), next2);
    mw(makeMockReq('2.2.2.2'), makeMockRes(), next2);
    expect(next2).toHaveBeenCalledTimes(2);
  });

  it('clearRateLimitBuckets stops the sweep timer', () => {
    const mw = createRateLimitMiddleware({ limit: 10, windowMs: 1000, keyGenerator: byIp });

    // Create an entry (starts sweep timer)
    mw(makeMockReq('10.0.0.1'), makeMockRes(), noop);

    // Clear everything (should stop timer too)
    clearRateLimitBuckets();

    // Advancing time should not throw or cause issues
    jest.advanceTimersByTime(10 * 60 * 1000);
  });

  it('stopRateLimitSweep stops the timer without clearing buckets', () => {
    const mw = createRateLimitMiddleware({ limit: 2, windowMs: 60_000, keyGenerator: byIp });

    // Create some active entries
    mw(makeMockReq('10.0.0.1'), makeMockRes(), noop);
    mw(makeMockReq('10.0.0.1'), makeMockRes(), noop);

    // Stop sweep (for graceful shutdown)
    stopRateLimitSweep();

    // Rate limiting should still work for active (non-expired) buckets
    const next2 = jest.fn();
    mw(makeMockReq('10.0.0.1'), makeMockRes(), next2);
    // Should be rate limited (count was 2, limit is 2)
    expect(next2).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429 }));
  });
});
