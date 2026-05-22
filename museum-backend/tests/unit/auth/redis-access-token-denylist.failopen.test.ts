/**
 * RED — T1.10 — R9 — `RedisAccessTokenDenylist` MUST fail-OPEN on Redis error :
 *   - `has(jti)` returns `false` instead of throwing (token accepted).
 *   - `add(jti, ttl)` resolves without throwing.
 *   - warn log emitted, rate-limited 1/minute (in-memory token bucket).
 *
 * Spec : team-state/2026-05-21-p0-c3-auth-crypto/spec.md §R9.
 * Design : team-state/2026-05-21-p0-c3-auth-crypto/design.md §3.1 §9 D9 :
 *   - fail-OPEN policy implemented INSIDE the adapter (not the middleware).
 *   - key shape `denylist:access:<jti>`.
 *   - `add` uses `SET ... EX ... NX` (atomic, no TTL reset on duplicate).
 *   - `has` uses `EXISTS`.
 *   - warn rate-limit : 1 / minute via in-memory `lastWarnAt`.
 *
 * Anchored to PATTERNS / LESSONS :
 *  - `lib-docs/ioredis/PATTERNS.md` §3 DO #6 `SET ... EX ... NX` atomic.
 *  - `lib-docs/ioredis/PATTERNS.md` §3 DON'T #11 `INCR` + `EXPIRE` split → use
 *    Lua / single-command-with-EX (we choose SET ... EX ... NX).
 *  - `lib-docs/ioredis/LESSONS.md:36` "fail-soft cache on get/set/del errors"
 *    pattern adopted from `redis-cache.service.ts`.
 *  - CLAUDE.md "Counters fail-CLOSED (`redis-llm-cost-counter.ts`) → OOM bloque
 *    le chat" — explicit cost/benefit : denylist is defense-in-depth, NOT
 *    primary identity ; we trade revocation latency for auth availability.
 *
 * Failure mode at HEAD `00325d81` :
 *  - The adapter file `src/modules/auth/adapters/secondary/redis/redis-access-token-denylist.ts`
 *    does NOT exist. The import below fails ("Cannot find module") → Jest
 *    marks every assertion in this file as failing.
 *
 * Run scope :
 *   pnpm jest tests/unit/auth/redis-access-token-denylist.failopen.test.ts
 */

import type Redis from 'ioredis';

/**
 * Future adapter shape pinned by R9 design §3.1 §10.
 * Path : src/modules/auth/adapters/secondary/redis/redis-access-token-denylist.ts
 * Constructor : (client: Redis, opts?: { now?: () => number; warn?: (msg, ctx) => void })
 */
interface IAccessTokenDenylistCtor {
  new (
    client: Redis,
    opts?: { now?: () => number; warn?: (msg: string, ctx: unknown) => void },
  ): {
    add(jti: string, ttlSec: number): Promise<void>;
    has(jti: string): Promise<boolean>;
  };
}

const requireAdapter = (): IAccessTokenDenylistCtor => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- module is a future export ; require lets us probe without TS error pre-existence
  const mod = require('@modules/auth/adapters/secondary/redis/redis-access-token-denylist') as {
    RedisAccessTokenDenylist: IAccessTokenDenylistCtor;
  };
  return mod.RedisAccessTokenDenylist;
};

/**
 * Stub Redis client surfacing only the commands the adapter touches : `set` +
 * `exists`. Mirror the stubRedis pattern from `nonce-store.test.ts`.
 */
const stubRedis = (impl: { set?: jest.Mock; exists?: jest.Mock }): Redis =>
  ({
    set: impl.set ?? jest.fn().mockResolvedValue('OK'),
    exists: impl.exists ?? jest.fn().mockResolvedValue(0),
  }) as unknown as Redis;

describe('RedisAccessTokenDenylist — happy path (R7/R8 read+write)', () => {
  it('add(jti, 60) issues `SET denylist:access:<jti> 1 EX 60 NX` (lib-docs/ioredis PATTERNS §3 #6)', async () => {
    const RedisAccessTokenDenylist = requireAdapter();
    const set = jest.fn().mockResolvedValue('OK');
    const denylist = new RedisAccessTokenDenylist(stubRedis({ set }));

    await denylist.add('jti-1', 60);

    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith('denylist:access:jti-1', '1', 'EX', 60, 'NX');
  });

  it('has(jti) on existing key returns true (EXISTS = 1)', async () => {
    const RedisAccessTokenDenylist = requireAdapter();
    const exists = jest.fn().mockResolvedValue(1);
    const denylist = new RedisAccessTokenDenylist(stubRedis({ exists }));

    await expect(denylist.has('jti-1')).resolves.toBe(true);
    expect(exists).toHaveBeenCalledWith('denylist:access:jti-1');
  });

  it('has(jti) on absent key returns false (EXISTS = 0)', async () => {
    const RedisAccessTokenDenylist = requireAdapter();
    const exists = jest.fn().mockResolvedValue(0);
    const denylist = new RedisAccessTokenDenylist(stubRedis({ exists }));

    await expect(denylist.has('jti-missing')).resolves.toBe(false);
  });

  it('add(jti, ttlSec) with ttlSec <= 0 is a no-op (R7 idempotent)', async () => {
    const RedisAccessTokenDenylist = requireAdapter();
    const set = jest.fn().mockResolvedValue('OK');
    const denylist = new RedisAccessTokenDenylist(stubRedis({ set }));

    await denylist.add('jti-expired', 0);
    await denylist.add('jti-expired', -5);

    expect(set).not.toHaveBeenCalled();
  });
});

describe('RedisAccessTokenDenylist — fail-OPEN on Redis error (R9)', () => {
  it('has() resolves to false when redis.exists rejects (fail-OPEN, R9.a)', async () => {
    const RedisAccessTokenDenylist = requireAdapter();
    const exists = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
    const warn = jest.fn();
    const denylist = new RedisAccessTokenDenylist(stubRedis({ exists }), { warn });

    await expect(denylist.has('jti-redis-down')).resolves.toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/access_token_denylist_unavailable/),
      expect.any(Object),
    );
  });

  it('add() resolves (no throw) when redis.set rejects (fail-OPEN write, R9.a)', async () => {
    const RedisAccessTokenDenylist = requireAdapter();
    const set = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
    const warn = jest.fn();
    const denylist = new RedisAccessTokenDenylist(stubRedis({ set }), { warn });

    await expect(denylist.add('jti-redis-down', 60)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('warn emitted only ONCE per minute even on repeated failures (R9.b — rate-limit)', async () => {
    const RedisAccessTokenDenylist = requireAdapter();
    const exists = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
    const warn = jest.fn();
    let nowMs = 0;
    const denylist = new RedisAccessTokenDenylist(stubRedis({ exists }), {
      warn,
      now: () => nowMs,
    });

    await denylist.has('jti-a');
    await denylist.has('jti-b'); // within same minute
    await denylist.has('jti-c');

    expect(warn).toHaveBeenCalledTimes(1);

    // Advance > 60s → next warn fires.
    nowMs = 61_000;
    await denylist.has('jti-d');
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('warn never includes the full jti (PII-ish enumeration defense, design §10 logs)', async () => {
    const RedisAccessTokenDenylist = requireAdapter();
    const exists = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
    const warn = jest.fn();
    const sensitiveJti = '550e8400-e29b-41d4-a716-446655440000';
    const denylist = new RedisAccessTokenDenylist(stubRedis({ exists }), { warn });

    await denylist.has(sensitiveJti);

    // No call argument (msg or context) should embed the full jti string.
    for (const call of warn.mock.calls) {
      for (const arg of call) {
        const serialized = typeof arg === 'string' ? arg : JSON.stringify(arg);
        expect(serialized).not.toContain(sensitiveJti);
      }
    }
  });
});
