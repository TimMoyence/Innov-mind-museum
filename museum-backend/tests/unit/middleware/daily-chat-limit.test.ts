import type { RequestHandler } from 'express';
import {
  dailyChatLimit,
  clearDailyChatLimitBuckets,
} from '@src/helpers/middleware/daily-chat-limit.middleware';

const makeMockReq = (overrides: Record<string, unknown> = {}): Parameters<RequestHandler>[0] =>
  ({
    ip: '10.0.0.1',
    socket: { remoteAddress: '10.0.0.1' },
    params: {},
    body: {},
    ...overrides,
  }) as unknown as Parameters<RequestHandler>[0];

const makeMockRes = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as unknown as Parameters<RequestHandler>[1];
};

describe('dailyChatLimit middleware', () => {
  beforeEach(() => {
    clearDailyChatLimitBuckets();
  });
  afterEach(() => {
    clearDailyChatLimitBuckets();
  });

  it('allows requests under the limit', () => {
    const req = makeMockReq({ user: { id: 1 } });
    const res = makeMockRes();
    const next = jest.fn();

    dailyChatLimit(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect((res as unknown as { status: jest.Mock }).status).not.toHaveBeenCalled();
  });

  it('blocks requests at the limit with 429', () => {
    const req = makeMockReq({ user: { id: 2 } });

    // Exhaust the limit (default 100)
    for (let i = 0; i < 100; i++) {
      const res = makeMockRes();
      const next = jest.fn();
      dailyChatLimit(req, res, next);
      expect(next).toHaveBeenCalledWith();
    }

    // The 101st request should be blocked
    const res = makeMockRes();
    const next = jest.fn();
    dailyChatLimit(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 429,
        code: 'DAILY_LIMIT_REACHED',
        message: 'Daily chat limit reached',
      }),
    );
  });

  it('resets counter on a new day', () => {
    const req = makeMockReq({ user: { id: 3 } });

    // Use up the limit
    for (let i = 0; i < 100; i++) {
      const res = makeMockRes();
      const next = jest.fn();
      dailyChatLimit(req, res, next);
    }

    // Verify blocked
    const blockedRes = makeMockRes();
    const blockedNext = jest.fn();
    dailyChatLimit(req, blockedRes, blockedNext);
    expect(blockedNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429 }));

    // Simulate next day by advancing fake timers past midnight
    jest.useFakeTimers();
    jest.setSystemTime(new Date(Date.now() + 24 * 60 * 60 * 1000));

    // Should be allowed again on the new day
    const res = makeMockRes();
    const next = jest.fn();
    dailyChatLimit(req, res, next);
    expect(next).toHaveBeenCalledWith();

    jest.useRealTimers();
  });

  it('skips if no user (unauthenticated)', () => {
    const req = makeMockReq(); // no user property
    const res = makeMockRes();
    const next = jest.fn();

    dailyChatLimit(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect((res as unknown as { status: jest.Mock }).status).not.toHaveBeenCalled();
  });

  it('skips if user has no id', () => {
    const req = makeMockReq({ user: {} });
    const res = makeMockRes();
    const next = jest.fn();

    dailyChatLimit(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });
});
