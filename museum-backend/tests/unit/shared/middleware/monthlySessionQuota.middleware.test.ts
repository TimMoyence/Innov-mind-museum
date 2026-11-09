import { monthlySessionQuota } from '@shared/middleware/monthly-session-quota.middleware';
import { logger } from '@shared/logger/logger';

import type { NextFunction, Request, Response } from 'express';

interface UserRecord {
  id: number;
  tier: 'free' | 'premium';
  sessionsMonthCount: number;
  sessionsMonthStart: Date | null;
}

function makeReq(user?: Partial<UserRecord> & { id?: number }): Request {
  return { user } as unknown as Request;
}

function makeRes(): Response & {
  _status?: number;
  _body?: Record<string, unknown>;
  statusCode?: number;
  _finishListeners: (() => void)[];
  _emitFinish: (statusCode: number) => void;
} {
  const res: Response & {
    _status?: number;
    _body?: Record<string, unknown>;
    statusCode?: number;
    _finishListeners: (() => void)[];
    _emitFinish: (statusCode: number) => void;
  } = {
    _finishListeners: [],
    status(code: number) {
      res._status = code;
      res.statusCode = code;
      return res;
    },
    json(body: Record<string, unknown>) {
      res._body = body;
      return res;
    },
    on(event: string, listener: () => void) {
      if (event === 'finish') res._finishListeners.push(listener);
      return res;
    },
    _emitFinish(statusCode: number) {
      res.statusCode = statusCode;
      for (const l of res._finishListeners) l();
    },
  } as unknown as Response & {
    _status?: number;
    _body?: Record<string, unknown>;
    statusCode?: number;
    _finishListeners: (() => void)[];
    _emitFinish: (statusCode: number) => void;
  };
  return res;
}

interface MonthlyQuotaRepo {
  loadUser(userId: number): Promise<UserRecord | null>;
  tryConsume(
    userId: number,
    monthStart: Date,
    limit: number,
  ): Promise<{ sessionsMonthCount: number; sessionsMonthStart: Date } | null>;
}

import { setMonthlyQuotaRepo } from '@shared/middleware/monthly-session-quota.middleware';

const firstOfThisUtcMonth = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
};

const firstOfNextUtcMonthIso = (): string => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
};

describe('monthlySessionQuota middleware (R1 §1 R5-R14 + N4/N5/N15)', () => {
  let repo: jest.Mocked<MonthlyQuotaRepo>;
  let next: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    repo = {
      loadUser: jest.fn(),
      tryConsume: jest.fn(),
    };
    next = jest.fn();
    setMonthlyQuotaRepo(repo);
    jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    setMonthlyQuotaRepo(null);
  });

  it('R14: anonymous request (no req.user) → next() passthrough, no DB hit', async () => {
    await monthlySessionQuota(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(repo.loadUser).not.toHaveBeenCalled();
    expect(repo.tryConsume).not.toHaveBeenCalled();
  });

  it('R5: premium tier → next() without tryConsume call', async () => {
    repo.loadUser.mockResolvedValue({
      id: 42,
      tier: 'premium',
      sessionsMonthCount: 999,
      sessionsMonthStart: firstOfThisUtcMonth(),
    });
    await monthlySessionQuota(makeReq({ id: 42 }), makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(repo.tryConsume).not.toHaveBeenCalled();
  });

  it('R6: free + sessionsMonthStart=null → atomic reset to 1, next()', async () => {
    repo.loadUser.mockResolvedValue({
      id: 7,
      tier: 'free',
      sessionsMonthCount: 0,
      sessionsMonthStart: null,
    });
    repo.tryConsume.mockResolvedValue({
      sessionsMonthCount: 1,
      sessionsMonthStart: firstOfThisUtcMonth(),
    });
    await monthlySessionQuota(makeReq({ id: 7 }), makeRes(), next);
    expect(repo.tryConsume).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it('R7: free + count<limit → atomic increment via tryConsume, next()', async () => {
    repo.loadUser.mockResolvedValue({
      id: 9,
      tier: 'free',
      sessionsMonthCount: 2,
      sessionsMonthStart: firstOfThisUtcMonth(),
    });
    repo.tryConsume.mockResolvedValue({
      sessionsMonthCount: 3,
      sessionsMonthStart: firstOfThisUtcMonth(),
    });
    await monthlySessionQuota(makeReq({ id: 9 }), makeRes(), next);
    expect(repo.tryConsume).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it('R8: free + over limit → 402 with full body shape (code/tier/currentCount/limit/resetAt)', async () => {
    repo.loadUser.mockResolvedValue({
      id: 11,
      tier: 'free',
      sessionsMonthCount: 3,
      sessionsMonthStart: firstOfThisUtcMonth(),
    });
    repo.tryConsume.mockResolvedValue(null);

    const res = makeRes();
    await monthlySessionQuota(makeReq({ id: 11 }), res, next);

    expect(res._status).toBe(402);
    expect(res._body).toEqual(
      expect.objectContaining({
        code: 'QUOTA_EXCEEDED',
        tier: 'free',
        currentCount: 3,
        limit: 3,
        resetAt: firstOfNextUtcMonthIso(),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('R12: emits quota_check_hit_limit log on FIRST 402, silent on subsequent', async () => {
    const infoSpy = jest.spyOn(logger, 'info');
    repo.loadUser.mockResolvedValue({
      id: 13,
      tier: 'free',
      sessionsMonthCount: 3,
      sessionsMonthStart: firstOfThisUtcMonth(),
    });
    repo.tryConsume.mockResolvedValue(null);

    await monthlySessionQuota(makeReq({ id: 13 }), makeRes(), jest.fn());
    await monthlySessionQuota(makeReq({ id: 13 }), makeRes(), jest.fn());

    const hits = infoSpy.mock.calls.filter((c) => c[0] === 'quota_check_hit_limit');
    expect(hits).toHaveLength(1);
    const [, payload] = hits[0] as [string, Record<string, unknown>];
    expect(payload).toMatchObject({
      userId: 13,
      currentCount: 3,
      limit: 3,
    });
  });

  it('N4: same user 402 again → identical body shape (idempotent)', async () => {
    repo.loadUser.mockResolvedValue({
      id: 17,
      tier: 'free',
      sessionsMonthCount: 3,
      sessionsMonthStart: firstOfThisUtcMonth(),
    });
    repo.tryConsume.mockResolvedValue(null);

    const res1 = makeRes();
    await monthlySessionQuota(makeReq({ id: 17 }), res1, jest.fn());
    const res2 = makeRes();
    await monthlySessionQuota(makeReq({ id: 17 }), res2, jest.fn());

    expect(res1._status).toBe(402);
    expect(res2._status).toBe(402);
    expect(res2._body).toEqual(res1._body);
  });

  it('R13: env freeTierMonthlySessionLimit drives `limit` in 402 body', async () => {
    repo.loadUser.mockResolvedValue({
      id: 19,
      tier: 'free',
      sessionsMonthCount: 3,
      sessionsMonthStart: firstOfThisUtcMonth(),
    });
    repo.tryConsume.mockResolvedValue(null);
    const res = makeRes();
    await monthlySessionQuota(makeReq({ id: 19 }), res, jest.fn());
    expect((res._body as { limit?: number } | undefined)?.limit).toBe(3);
  });
});
