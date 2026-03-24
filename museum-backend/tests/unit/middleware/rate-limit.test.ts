import type { Request, RequestHandler } from 'express';
import {
  createRateLimitMiddleware,
  byIp,
  bySession,
  byUserId,
  clearRateLimitBuckets,
} from '@src/helpers/middleware/rate-limit.middleware';

const makeMockReq = (overrides: Record<string, unknown> = {}): Parameters<RequestHandler>[0] =>
  ({
    ip: '10.0.0.1',
    socket: { remoteAddress: '10.0.0.1' },
    params: {},
    body: {},
    header: () => undefined,
    ...overrides,
  }) as unknown as Parameters<RequestHandler>[0];

const makeMockRes = () => ({ setHeader: jest.fn() }) as unknown as Parameters<RequestHandler>[1];

describe('rate-limit middleware — branch coverage', () => {
  beforeEach(() => clearRateLimitBuckets());
  afterEach(() => clearRateLimitBuckets());

  it('allows requests up to the limit then rejects with 429', () => {
    const mw = createRateLimitMiddleware({ limit: 2, windowMs: 60_000, keyGenerator: byIp });
    const req = makeMockReq();
    const res = makeMockRes();

    // First two should pass
    const next1 = jest.fn();
    mw(req, res, next1);
    expect(next1).toHaveBeenCalledWith();

    const next2 = jest.fn();
    mw(req, res, next2);
    expect(next2).toHaveBeenCalledWith();

    // Third should be rejected
    const next3 = jest.fn();
    mw(req, res, next3);
    expect(next3).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429 }));
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });

  it('resets after the window expires', () => {
    jest.useFakeTimers();
    const windowMs = 1000;
    const mw = createRateLimitMiddleware({ limit: 1, windowMs, keyGenerator: byIp });
    const req = makeMockReq();
    const res = makeMockRes();

    const next1 = jest.fn();
    mw(req, res, next1);
    expect(next1).toHaveBeenCalledWith();

    // Advance past the window
    jest.advanceTimersByTime(windowMs + 1);

    const next2 = jest.fn();
    mw(req, res, next2);
    expect(next2).toHaveBeenCalledWith();

    jest.useRealTimers();
  });
});

describe('byIp key generator', () => {
  it('returns req.ip when available', () => {
    expect(byIp(makeMockReq({ ip: '1.2.3.4' }))).toBe('1.2.3.4');
  });

  it('falls back to socket.remoteAddress', () => {
    expect(byIp(makeMockReq({ ip: undefined, socket: { remoteAddress: '5.6.7.8' } }))).toBe('5.6.7.8');
  });

  it('falls back to "unknown-ip" when both are absent', () => {
    expect(byIp(makeMockReq({ ip: undefined, socket: {} }))).toBe('unknown-ip');
  });
});

describe('bySession key generator', () => {
  it('uses params.id when present', () => {
    const req = makeMockReq({ params: { id: 'sess-abc' } });
    expect(bySession(req)).toBe('session:sess-abc');
  });

  it('uses body.sessionId when params.id is absent', () => {
    const req = makeMockReq({ params: {}, body: { sessionId: 'sess-body' } });
    expect(bySession(req)).toBe('session:sess-body');
  });

  it('uses x-session-id header when params and body are absent', () => {
    const req = makeMockReq({
      params: {},
      body: {},
      header: (name: string) => (name === 'x-session-id' ? 'sess-header' : undefined),
    });
    expect(bySession(req)).toBe('session:sess-header');
  });

  it('falls back to IP when no session identifier is available', () => {
    const req = makeMockReq({ ip: '9.8.7.6', params: {}, body: {} });
    expect(bySession(req)).toBe('9.8.7.6');
  });
});

describe('byUserId key generator', () => {
  it('uses user.id when available', () => {
    const req = makeMockReq({ user: { id: 42 } }) as unknown as Request;
    expect(byUserId(req)).toBe('user:42');
  });

  it('falls back to IP when user is not set', () => {
    const req = makeMockReq({ ip: '10.20.30.40' });
    expect(byUserId(req)).toBe('10.20.30.40');
  });

  it('falls back to IP when user has no id', () => {
    const req = makeMockReq({ user: {} });
    expect(byUserId(req)).toBe('10.0.0.1');
  });
});
