import { createHash } from 'node:crypto';

import {
  checkLoginRateLimit,
  recordFailedLogin,
  clearLoginAttempts,
  setLoginRateLimitStore,
  _resetAllAttempts,
  _clearLocalOnlyForTest,
} from '@modules/auth/useCase/session/login-rate-limiter';

import type { AppError } from '@shared/errors/app.error';
import type { RedisRateLimitStore } from '@shared/middleware/redis-rate-limit-store';

import { makeCountedUnit as countedUnit } from '../../helpers/rate-limit/counted-unit.fixtures';

beforeEach(() => {
  _resetAllAttempts();
});

type IncrementFn = RedisRateLimitStore['increment'];
type ResetFn = RedisRateLimitStore['reset'];
type IncrementResult = Awaited<ReturnType<IncrementFn>>;

interface MockRedisStoreOverrides {
  increment?: jest.MockedFunction<IncrementFn>;
  reset?: jest.MockedFunction<ResetFn>;
  lockoutEval?: jest.Mock;
  lockoutDel?: jest.Mock;
}

type MockRedisStore = jest.Mocked<RedisRateLimitStore> & {
  lockoutEval: jest.Mock;
  lockoutDel: jest.Mock;
};

const makeMockRedisStore = (overrides: MockRedisStoreOverrides = {}): MockRedisStore => {
  const defaultIncrement = jest
    .fn<ReturnType<IncrementFn>, Parameters<IncrementFn>>()
    .mockImplementation((...args) => {
      const windowMs = args[1];
      return Promise.resolve(countedUnit(1, Date.now() + windowMs));
    });
  const defaultReset = jest
    .fn<ReturnType<ResetFn>, Parameters<ResetFn>>()
    .mockResolvedValue(undefined);

  const lockoutEval = overrides.lockoutEval ?? jest.fn().mockResolvedValue(1);
  const lockoutDel = overrides.lockoutDel ?? jest.fn().mockResolvedValue(1);

  const redisClientStub = { eval: lockoutEval, del: lockoutDel };

  return {
    increment: overrides.increment ?? defaultIncrement,
    reset: overrides.reset ?? defaultReset,
    clear: jest.fn(),
    stopSweep: jest.fn(),
    getRedisClient: jest.fn().mockReturnValue(redisClientStub),
    lockoutEval,
    lockoutDel,
  } as unknown as MockRedisStore;
};

const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const hashEmail = (email: string): string => createHash('sha1').update(email).digest('hex');

const expectThrowsAppError = (fn: () => void): AppError => {
  try {
    fn();
  } catch (err) {
    return err as AppError;
  }
  throw new Error('Expected checkLoginRateLimit to throw');
};

describe('login-rate-limiter — sliding window', () => {
  it('allows first attempt', () => {
    expect(() => {
      checkLoginRateLimit('user@test.com');
    }).not.toThrow();
  });

  it('allows fewer than LOCKOUT_THRESHOLD (5) failures without blocking', () => {
    for (let i = 0; i < 4; i++) {
      recordFailedLogin('user@test.com');
    }
    expect(() => {
      checkLoginRateLimit('user@test.com');
    }).not.toThrow();
  });

  it('blocks after 10 failed attempts with a 429', () => {
    for (let i = 0; i < 10; i++) {
      recordFailedLogin('user@test.com');
    }
    const err = expectThrowsAppError(() => {
      checkLoginRateLimit('user@test.com');
    });
    expect(err.statusCode).toBe(429);
  });

  it('clears all attempts on successful login', () => {
    for (let i = 0; i < 9; i++) {
      recordFailedLogin('user@test.com');
    }
    clearLoginAttempts('user@test.com');
    expect(() => {
      checkLoginRateLimit('user@test.com');
    }).not.toThrow();
  });

  it('is case-insensitive', () => {
    for (let i = 0; i < 10; i++) {
      recordFailedLogin('User@Test.COM');
    }
    expect(() => {
      checkLoginRateLimit('user@test.com');
    }).toThrow();
  });

  it('allows attempts again once the sliding window AND lockout have elapsed', () => {
    jest.useFakeTimers();

    for (let i = 0; i < 10; i++) {
      recordFailedLogin('expired@test.com');
    }
    expect(() => {
      checkLoginRateLimit('expired@test.com');
    }).toThrow();

    jest.advanceTimersByTime(15 * 60 * 1000 + 1);

    expect(() => {
      checkLoginRateLimit('expired@test.com');
    }).not.toThrow();

    jest.useRealTimers();
  });
});

describe('login-rate-limiter — exponential lockout', () => {
  it('allows 4 failures without lockout', () => {
    for (let i = 0; i < 4; i++) {
      recordFailedLogin('lock@test.com');
    }
    expect(() => {
      checkLoginRateLimit('lock@test.com');
    }).not.toThrow();
  });

  it('blocks the 6th attempt after 5 failures with Retry-After header', () => {
    for (let i = 0; i < 5; i++) {
      recordFailedLogin('lock@test.com');
    }
    const err = expectThrowsAppError(() => {
      checkLoginRateLimit('lock@test.com');
    });

    expect(err.statusCode).toBe(429);
    expect(err.code).toBe('AUTH_LOCKED_OUT');
    expect(err.headers?.['Retry-After']).toBeDefined();

    const retryAfterSec = Number.parseInt(err.headers?.['Retry-After'] ?? '0', 10);
    expect(retryAfterSec).toBeGreaterThan(0);
    expect(retryAfterSec).toBeLessThanOrEqual(30);
  });

  it('doubles the lockout window on the 7th consecutive failure', () => {
    jest.useFakeTimers();

    for (let i = 0; i < 5; i++) {
      recordFailedLogin('expo@test.com');
    }
    const err5 = expectThrowsAppError(() => {
      checkLoginRateLimit('expo@test.com');
    });
    const retry5 = Number.parseInt(err5.headers?.['Retry-After'] ?? '0', 10);
    expect(retry5).toBeLessThanOrEqual(30);

    jest.advanceTimersByTime(31 * 1000);

    recordFailedLogin('expo@test.com');
    const err6 = expectThrowsAppError(() => {
      checkLoginRateLimit('expo@test.com');
    });
    const retry6 = Number.parseInt(err6.headers?.['Retry-After'] ?? '0', 10);
    expect(retry6).toBeGreaterThan(30);
    expect(retry6).toBeLessThanOrEqual(60);

    jest.advanceTimersByTime(61 * 1000);

    recordFailedLogin('expo@test.com');
    const err7 = expectThrowsAppError(() => {
      checkLoginRateLimit('expo@test.com');
    });
    const retry7 = Number.parseInt(err7.headers?.['Retry-After'] ?? '0', 10);
    expect(retry7).toBeGreaterThan(60);
    expect(retry7).toBeLessThanOrEqual(120);

    jest.useRealTimers();
  });

  it('caps the lockout at MAX_LOCKOUT_MS (15 minutes)', () => {
    for (let i = 0; i < 20; i++) {
      recordFailedLogin('cap@test.com');
    }
    const err = expectThrowsAppError(() => {
      checkLoginRateLimit('cap@test.com');
    });
    const retry = Number.parseInt(err.headers?.['Retry-After'] ?? '0', 10);
    expect(retry).toBeLessThanOrEqual(15 * 60);
  });

  it('resets the lockout counter on successful login', () => {
    for (let i = 0; i < 10; i++) {
      recordFailedLogin('reset-lock@test.com');
    }
    expect(() => {
      checkLoginRateLimit('reset-lock@test.com');
    }).toThrow();

    clearLoginAttempts('reset-lock@test.com');

    expect(() => {
      checkLoginRateLimit('reset-lock@test.com');
    }).not.toThrow();
  });

  it('exposes retryAfterSec and failure count in error details', () => {
    for (let i = 0; i < 7; i++) {
      recordFailedLogin('details@test.com');
    }
    const err = expectThrowsAppError(() => {
      checkLoginRateLimit('details@test.com');
    });
    const details = err.details as { retryAfterSec?: number; failures?: number } | undefined;
    expect(details?.failures).toBe(7);
    expect(details?.retryAfterSec).toBeGreaterThan(0);
  });
});

describe('login-rate-limiter — distributed Redis path', () => {
  it('fires an atomic Lua EVAL for the lockout counter on recordFailedLogin', async () => {
    const mock = makeMockRedisStore();
    setLoginRateLimitStore(mock);

    recordFailedLogin('lua@test.com');
    await flushMicrotasks();

    expect(mock.lockoutEval).toHaveBeenCalledTimes(1);
    const [script, numKeys, key, ttl] = mock.lockoutEval.mock.calls[0];
    expect(typeof script).toBe('string');
    expect(script).toContain('INCR');
    expect(script).toContain('PEXPIRE');
    expect(numKeys).toBe(1);
    expect(key).toBe(`auth:lockout:${hashEmail('lua@test.com')}`);
    expect(Number.parseInt(ttl, 10)).toBeGreaterThan(0);
  });

  it('calls redisStore.increment with hashed prefixed key and window on recordFailedLogin', async () => {
    const mock = makeMockRedisStore();
    setLoginRateLimitStore(mock);

    recordFailedLogin('distrib@test.com');
    await flushMicrotasks();

    expect(mock.increment).toHaveBeenCalledTimes(1);
    const [key, windowMs] = mock.increment.mock.calls[0];
    expect(key).toBe(`login-attempts:${hashEmail('distrib@test.com')}`);
    expect(key).not.toContain('@');
    expect(windowMs).toBe(10 * 60 * 1000);
  });

  it('mirrors distributed sliding-window count into local snapshot, blocking subsequent checks', async () => {
    const mock = makeMockRedisStore({
      increment: jest
        .fn<ReturnType<IncrementFn>, Parameters<IncrementFn>>()
        .mockImplementation((...args): Promise<IncrementResult> => {
          const windowMs = args[1];
          return Promise.resolve(countedUnit(10, Date.now() + windowMs));
        }),
    });
    setLoginRateLimitStore(mock);

    recordFailedLogin('peer@test.com');
    await flushMicrotasks();

    expect(() => {
      checkLoginRateLimit('peer@test.com');
    }).toThrow(/Too many login attempts|Account temporarily locked/);
  });

  it('mirrors lockout counter from Redis so peer-instance failures trigger lockout here', async () => {
    const mock = makeMockRedisStore({
      lockoutEval: jest.fn().mockResolvedValue(5),
    });
    setLoginRateLimitStore(mock);

    recordFailedLogin('mirror-lock@test.com');
    await flushMicrotasks();

    const err = expectThrowsAppError(() => {
      checkLoginRateLimit('mirror-lock@test.com');
    });
    expect(err.code).toBe('AUTH_LOCKED_OUT');
  });

  it('calls redisStore.reset and lockout DEL on clearLoginAttempts', async () => {
    const mock = makeMockRedisStore();
    setLoginRateLimitStore(mock);

    clearLoginAttempts('reset@test.com');
    await flushMicrotasks();

    expect(mock.reset).toHaveBeenCalledTimes(1);
    expect(mock.reset.mock.calls[0][0]).toBe(`login-attempts:${hashEmail('reset@test.com')}`);
    expect(mock.lockoutDel).toHaveBeenCalledTimes(1);
    expect(mock.lockoutDel.mock.calls[0][0]).toBe(`auth:lockout:${hashEmail('reset@test.com')}`);
  });

  it('does not throw on Redis failures, local snapshot still bounds brute-force', async () => {
    const mock = makeMockRedisStore({
      increment: jest
        .fn<ReturnType<IncrementFn>, Parameters<IncrementFn>>()
        .mockRejectedValue(new Error('redis down')),
      lockoutEval: jest.fn().mockRejectedValue(new Error('redis down')),
    });
    setLoginRateLimitStore(mock);

    expect(() => {
      recordFailedLogin('fail-open@test.com');
    }).not.toThrow();
    await flushMicrotasks();

    for (let i = 0; i < 4; i++) {
      recordFailedLogin('fail-open@test.com');
    }
    await flushMicrotasks();
    expect(() => {
      checkLoginRateLimit('fail-open@test.com');
    }).toThrow(/Account temporarily locked|Too many login attempts/);
  });

  it('clears local attempts even when Redis reset rejects', async () => {
    setLoginRateLimitStore(null);
    for (let i = 0; i < 10; i++) {
      recordFailedLogin('fail-clear@test.com');
    }
    expect(() => {
      checkLoginRateLimit('fail-clear@test.com');
    }).toThrow();

    const mock = makeMockRedisStore({
      reset: jest
        .fn<ReturnType<ResetFn>, Parameters<ResetFn>>()
        .mockRejectedValue(new Error('redis down')),
      lockoutDel: jest.fn().mockRejectedValue(new Error('redis down')),
    });
    setLoginRateLimitStore(mock);

    expect(() => {
      clearLoginAttempts('fail-clear@test.com');
    }).not.toThrow();
    await flushMicrotasks();

    expect(mock.reset).toHaveBeenCalledTimes(1);
    expect(() => {
      checkLoginRateLimit('fail-clear@test.com');
    }).not.toThrow();
  });

  it('uses in-memory-only path when no Redis store is registered', () => {
    setLoginRateLimitStore(null);

    for (let i = 0; i < 10; i++) {
      recordFailedLogin('no-redis@test.com');
    }
    expect(() => {
      checkLoginRateLimit('no-redis@test.com');
    }).toThrow();
  });
});

describe('login-rate-limiter — fail-closed degraded mode', () => {
  it('throws 503 when Redis is degraded AND no local snapshot for the email', async () => {
    const mock = makeMockRedisStore({
      increment: jest
        .fn<ReturnType<IncrementFn>, Parameters<IncrementFn>>()
        .mockRejectedValue(new Error('redis down')),
      lockoutEval: jest.fn().mockRejectedValue(new Error('redis down')),
    });
    setLoginRateLimitStore(mock);

    recordFailedLogin('cold@test.com');
    await flushMicrotasks();
    _clearLocalOnlyForTest('cold@test.com');

    const err = expectThrowsAppError(() => {
      checkLoginRateLimit('cold@test.com');
    });
    expect(err.statusCode).toBe(503);
    expect(err.code).toBe('AUTH_RATE_LIMIT_UNAVAILABLE');
    expect(err.headers?.['Retry-After']).toBeDefined();
  });

  it('does not 503 on emails that have never seen a Redis failure', async () => {
    const mock = makeMockRedisStore({
      increment: jest
        .fn<ReturnType<IncrementFn>, Parameters<IncrementFn>>()
        .mockRejectedValue(new Error('redis down')),
      lockoutEval: jest.fn().mockRejectedValue(new Error('redis down')),
    });
    setLoginRateLimitStore(mock);

    recordFailedLogin('noisy@test.com');
    await flushMicrotasks();

    expect(() => {
      checkLoginRateLimit('fresh@test.com');
    }).not.toThrow();
  });

  it('clears the degraded marker when Redis recovers', async () => {
    const mock = makeMockRedisStore({
      increment: jest
        .fn<ReturnType<IncrementFn>, Parameters<IncrementFn>>()
        .mockRejectedValueOnce(new Error('down'))
        .mockResolvedValueOnce(countedUnit(1, Date.now() + 10 * 60 * 1000)),
      lockoutEval: jest.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(2),
    });
    setLoginRateLimitStore(mock);

    recordFailedLogin('recover@test.com');
    await flushMicrotasks();

    recordFailedLogin('recover@test.com');
    await flushMicrotasks();

    _clearLocalOnlyForTest('recover@test.com');
    expect(() => {
      checkLoginRateLimit('recover@test.com');
    }).not.toThrow();
  });
});
