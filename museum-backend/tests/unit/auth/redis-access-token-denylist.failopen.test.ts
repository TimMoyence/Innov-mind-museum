import type Redis from 'ioredis';

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
  const mod = require('@modules/auth/adapters/secondary/redis/redis-access-token-denylist') as {
    RedisAccessTokenDenylist: IAccessTokenDenylistCtor;
  };
  return mod.RedisAccessTokenDenylist;
};

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
    await denylist.has('jti-b');
    await denylist.has('jti-c');

    expect(warn).toHaveBeenCalledTimes(1);

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

    for (const call of warn.mock.calls) {
      for (const arg of call) {
        const serialized = typeof arg === 'string' ? arg : JSON.stringify(arg);
        expect(serialized).not.toContain(sensitiveJti);
      }
    }
  });
});
