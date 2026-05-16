/**
 * R1 RED — monthlySessionQuota middleware (T1.2).
 *
 * Pins R1 §1 R5/R6/R7/R8/R11/R12/R13/R14 + N4/N5/N13/N15 down BEFORE
 * implementation :
 *  - R5 premium tier → bypass next() without DB write.
 *  - R6 month rollover (start NULL or different month) → atomic reset+count-1.
 *  - R7 same month + count < limit → atomic increment +1.
 *  - R8 same month + count >= limit → 402 with full body shape
 *    `{ code:'QUOTA_EXCEEDED', tier, currentCount, limit, resetAt }`.
 *  - R11 atomic UPDATE — single statement, no read-then-write race.
 *  - R12 `quota_check_hit_limit` log emitted on FIRST 402 of (user, month),
 *    silent on subsequent 402s of the same month.
 *  - R13 env `freeTierMonthlySessionLimit` default 3 fallback.
 *  - R14 anonymous user (`req.user` undefined) → next() passthrough.
 *  - N4 402 body is idempotent across retries within the same month.
 *  - N5 `resetAt` is the first day of the NEXT UTC month.
 *  - N15 quota response uses 402 (NOT 429).
 *
 * MUST FAIL at baseline `cd7e22bc` — middleware file
 * `src/shared/middleware/monthly-session-quota.middleware.ts` does not exist.
 *
 * Spec drift logged in report : the spec at R1 §0.3 names the file
 * `monthly-session-quota.middleware.ts` (kebab-case). This test uses that
 * canonical path. The brief's per-test path `monthlySessionQuota.middleware.test.ts`
 * (camelCase test file naming) is preserved so the brief's pnpm filter
 * `--testPathPattern=monthlySessionQuota` matches.
 */
import { monthlySessionQuota } from '@shared/middleware/monthly-session-quota.middleware';
import { logger } from '@shared/logger/logger';

import type { NextFunction, Request, Response } from 'express';

interface UserRecord {
  id: number;
  tier: 'free' | 'premium';
  sessionsMonthCount: number;
  sessionsMonthStart: Date | null;
}

/**
 * Minimal request/response/next stub. The middleware reads `req.user` (set
 * upstream by `isAuthenticated`) and either calls `next()` or writes a 402
 * via `res.status().json()`.
 * @param user - Optional req.user payload ; omit to model anonymous request.
 * @returns Express `Request` stub carrying only the user identity slot.
 */
function makeReq(user?: Partial<UserRecord> & { id?: number }): Request {
  return { user } as unknown as Request;
}

function makeRes(): Response & {
  _status?: number;
  _body?: Record<string, unknown>;
} {
  const res: Response & { _status?: number; _body?: Record<string, unknown> } = {
    status(code: number) {
      res._status = code;
      return res;
    },
    json(body: Record<string, unknown>) {
      res._body = body;
      return res;
    },
  } as unknown as Response & { _status?: number; _body?: Record<string, unknown> };
  return res;
}

/**
 * The middleware needs to read + mutate the user row atomically. Tests inject
 * a deterministic repository via `setMonthlyQuotaRepo` (a setter the green
 * agent is free to implement either as a module-level setter or by reading
 * `req.user` directly + delegating). The contract under test :
 *  - `loadUser(userId)` → current row (tier + count + start).
 *  - `tryConsume(userId, monthStart, limit)` → atomic UPDATE returning the
 *    post-update row OR null when quota exhausted (R11 single-SQL contract).
 */
interface MonthlyQuotaRepo {
  loadUser(userId: number): Promise<UserRecord | null>;
  tryConsume(
    userId: number,
    monthStart: Date,
    limit: number,
  ): Promise<{ sessionsMonthCount: number; sessionsMonthStart: Date } | null>;
}

// The setter is expected to live next to the middleware export. Tests import
// it via the same module path ; if absent at HEAD, the require below throws
// and every test in this file fails at module-load time (which is the
// intended RED state).
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
    // Clear in-memory single-emit log dedup state (R12). The setter accepts
    // `null` to clear ; the green agent may also expose a dedicated reset.
    setMonthlyQuotaRepo(null);
  });

  // ── R14 — anonymous passthrough ──────────────────────────────────────

  it('R14: anonymous request (no req.user) → next() passthrough, no DB hit', async () => {
    await monthlySessionQuota(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(repo.loadUser).not.toHaveBeenCalled();
    expect(repo.tryConsume).not.toHaveBeenCalled();
  });

  // ── R5 — premium passthrough ─────────────────────────────────────────

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

  // ── R6 — month rollover (start NULL) ─────────────────────────────────

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

  // ── R7 — same month, under limit ─────────────────────────────────────

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

  // ── R8 / R11 — over-limit 402 with full body shape ───────────────────

  it('R8: free + over limit → 402 with full body shape (code/tier/currentCount/limit/resetAt)', async () => {
    repo.loadUser.mockResolvedValue({
      id: 11,
      tier: 'free',
      sessionsMonthCount: 3,
      sessionsMonthStart: firstOfThisUtcMonth(),
    });
    // R11 — tryConsume returns null when the atomic UPDATE's WHERE clause
    // refuses (count >= limit on the row at the moment of SQL re-eval).
    repo.tryConsume.mockResolvedValue(null);

    const res = makeRes();
    await monthlySessionQuota(makeReq({ id: 11 }), res, next);

    // N15 — status MUST be 402 (Payment Required), NOT 429.
    expect(res._status).toBe(402);
    expect(res._body).toEqual(
      expect.objectContaining({
        code: 'QUOTA_EXCEEDED',
        tier: 'free',
        currentCount: 3,
        limit: 3,
        // N5 — resetAt is first-of-next-UTC-month ISO.
        resetAt: firstOfNextUtcMonthIso(),
      }),
    );
    // Handler MUST NOT execute (R8 last sentence).
    expect(next).not.toHaveBeenCalled();
  });

  // ── R12 — single log emission per (user, month) ──────────────────────

  it('R12: emits quota_check_hit_limit log on FIRST 402, silent on subsequent', async () => {
    const infoSpy = jest.spyOn(logger, 'info');
    repo.loadUser.mockResolvedValue({
      id: 13,
      tier: 'free',
      sessionsMonthCount: 3,
      sessionsMonthStart: firstOfThisUtcMonth(),
    });
    repo.tryConsume.mockResolvedValue(null);

    // First 402 — single log expected.
    await monthlySessionQuota(makeReq({ id: 13 }), makeRes(), jest.fn());
    // Second 402 same month — log MUST be silent (R12 once-per-(user,month)).
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

  // ── N4 — 402 body idempotent across retries ──────────────────────────

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

  // ── R13 — env default fallback ───────────────────────────────────────

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
    // Default 3 when env unset (R13). Test env doesn't override.
    expect((res._body as { limit?: number } | undefined)?.limit).toBe(3);
  });
});
