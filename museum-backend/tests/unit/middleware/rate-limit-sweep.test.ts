import {
  clearRateLimitBuckets,
  createRateLimitMiddleware,
  byIp,
  stopRateLimitSweep,
} from '@shared/middleware/rate-limit.middleware';
import { makePartialRequest, makePartialResponse } from '../../helpers/http/express-mock.helpers';

describe('rate-limit middleware — sweep and eviction', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    clearRateLimitBuckets();
  });

  afterEach(() => {
    clearRateLimitBuckets();
    jest.useRealTimers();
  });

  const makeMockReq = (ip: string) => makePartialRequest({ ip, socket: { remoteAddress: ip } });
  const makeMockRes = makePartialResponse;
  const noop = jest.fn();

  it('evicts expired buckets after sweep interval', () => {
    const mw = createRateLimitMiddleware({ limit: 10, windowMs: 1000, keyGenerator: byIp });
    const req = makeMockReq('1.2.3.4');

    mw(req, makeMockRes(), noop);
    expect(noop).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(5 * 60 * 1000 + 1);

    const next2 = jest.fn();
    mw(req, makeMockRes(), next2);
    expect(next2).toHaveBeenCalledTimes(1);
    expect(next2).toHaveBeenCalledWith();
  });

  it('respects MAX_MAP_SIZE cap by evicting oldest entry', () => {
    const mw = createRateLimitMiddleware({ limit: 2, windowMs: 100, keyGenerator: byIp });

    const next1 = jest.fn();
    mw(makeMockReq('1.1.1.1'), makeMockRes(), next1);
    mw(makeMockReq('2.2.2.2'), makeMockRes(), next1);

    expect(next1).toHaveBeenCalledTimes(2);

    jest.advanceTimersByTime(200);

    const next2 = jest.fn();
    mw(makeMockReq('1.1.1.1'), makeMockRes(), next2);
    mw(makeMockReq('2.2.2.2'), makeMockRes(), next2);
    expect(next2).toHaveBeenCalledTimes(2);
  });

  it('clearRateLimitBuckets stops the sweep timer', () => {
    const mw = createRateLimitMiddleware({ limit: 10, windowMs: 1000, keyGenerator: byIp });

    mw(makeMockReq('10.0.0.1'), makeMockRes(), noop);

    clearRateLimitBuckets();

    jest.advanceTimersByTime(10 * 60 * 1000);
  });

  it('stopRateLimitSweep stops the timer without clearing buckets', () => {
    const mw = createRateLimitMiddleware({ limit: 2, windowMs: 60_000, keyGenerator: byIp });

    mw(makeMockReq('10.0.0.1'), makeMockRes(), noop);
    mw(makeMockReq('10.0.0.1'), makeMockRes(), noop);

    stopRateLimitSweep();

    const next2 = jest.fn();
    mw(makeMockReq('10.0.0.1'), makeMockRes(), next2);
    expect(next2).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429 }));
  });
});
