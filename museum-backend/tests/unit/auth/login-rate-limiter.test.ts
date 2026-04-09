import {
  checkLoginRateLimit,
  recordFailedLogin,
  clearLoginAttempts,
  setLoginRateLimitStore,
  _resetAllAttempts,
} from '@modules/auth/useCase/login-rate-limiter';

import type { RedisRateLimitStore } from '@src/helpers/middleware/redis-rate-limit-store';

beforeEach(() => {
  _resetAllAttempts();
});

type IncrementFn = RedisRateLimitStore['increment'];
type ResetFn = RedisRateLimitStore['reset'];
type IncrementResult = Awaited<ReturnType<IncrementFn>>;

interface MockRedisStoreOverrides {
  increment?: jest.MockedFunction<IncrementFn>;
  reset?: jest.MockedFunction<ResetFn>;
}

/**
 * Builds a mock RedisRateLimitStore with jest mocks for `increment` and `reset`.
 * @param overrides - Optional per-call mock overrides for `increment` and `reset`.
 * @returns A partially-mocked `RedisRateLimitStore` suitable for dependency injection.
 */
const makeMockRedisStore = (
  overrides: MockRedisStoreOverrides = {},
): {
  increment: jest.MockedFunction<IncrementFn>;
  reset: jest.MockedFunction<ResetFn>;
} => {
  const defaultIncrement = jest
    .fn<ReturnType<IncrementFn>, Parameters<IncrementFn>>()
    .mockImplementation((...args) => {
      const windowMs = args[1];
      return Promise.resolve({ count: 1, resetAt: Date.now() + windowMs });
    });
  const defaultReset = jest
    .fn<ReturnType<ResetFn>, Parameters<ResetFn>>()
    .mockResolvedValue(undefined);

  return {
    increment: overrides.increment ?? defaultIncrement,
    reset: overrides.reset ?? defaultReset,
  };
};

/** Yield to the microtask queue so background `.then()` handlers run. */
const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('login-rate-limiter', () => {
  it('allows first attempt', () => {
    expect(() => {
      checkLoginRateLimit('user@test.com');
    }).not.toThrow();
  });

  it('allows up to 9 failed attempts', () => {
    for (let i = 0; i < 9; i++) {
      recordFailedLogin('user@test.com');
    }
    expect(() => {
      checkLoginRateLimit('user@test.com');
    }).not.toThrow();
  });

  it('blocks after 10 failed attempts', () => {
    for (let i = 0; i < 10; i++) {
      recordFailedLogin('user@test.com');
    }
    expect(() => {
      checkLoginRateLimit('user@test.com');
    }).toThrow('Too many login attempts');
  });

  it('clears attempts on successful login', () => {
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

  it('resets expired entries on check', () => {
    jest.useFakeTimers();

    // Record 10 failed attempts (would block)
    for (let i = 0; i < 10; i++) {
      recordFailedLogin('expired@test.com');
    }
    expect(() => {
      checkLoginRateLimit('expired@test.com');
    }).toThrow();

    // Advance past the 10-minute window
    jest.advanceTimersByTime(10 * 60 * 1000 + 1);

    // Entry should now be expired and removed on check
    expect(() => {
      checkLoginRateLimit('expired@test.com');
    }).not.toThrow();

    jest.useRealTimers();
  });

  it('resets expired entries on record', () => {
    jest.useFakeTimers();

    recordFailedLogin('expired-record@test.com');

    // Advance past the window
    jest.advanceTimersByTime(10 * 60 * 1000 + 1);

    // Recording again should start fresh (count=1, not count=2)
    recordFailedLogin('expired-record@test.com');

    // Should not throw (only 1 attempt after reset)
    expect(() => {
      checkLoginRateLimit('expired-record@test.com');
    }).not.toThrow();

    jest.useRealTimers();
  });
});

describe('login-rate-limiter (distributed Redis path)', () => {
  it('calls redisStore.increment with prefixed key and window on recordFailedLogin', async () => {
    const mock = makeMockRedisStore();
    setLoginRateLimitStore(mock as unknown as RedisRateLimitStore);

    recordFailedLogin('distrib@test.com');
    await flushMicrotasks();

    expect(mock.increment).toHaveBeenCalledTimes(1);
    const [key, windowMs] = mock.increment.mock.calls[0];
    expect(key).toBe('login-attempts:distrib@test.com');
    expect(windowMs).toBe(10 * 60 * 1000);
  });

  it('mirrors distributed count into local snapshot, blocking subsequent checks', async () => {
    const mock = makeMockRedisStore({
      increment: jest
        .fn<ReturnType<IncrementFn>, Parameters<IncrementFn>>()
        .mockImplementation((...args): Promise<IncrementResult> => {
          const windowMs = args[1];
          // simulate that 9 failures on peer instances already happened
          return Promise.resolve({ count: 10, resetAt: Date.now() + windowMs });
        }),
    });
    setLoginRateLimitStore(mock as unknown as RedisRateLimitStore);

    recordFailedLogin('peer@test.com');
    await flushMicrotasks();

    // Local snapshot should have been mirrored to count=10, triggering 429
    expect(() => {
      checkLoginRateLimit('peer@test.com');
    }).toThrow('Too many login attempts');
  });

  it('calls redisStore.reset with prefixed key on clearLoginAttempts', async () => {
    const mock = makeMockRedisStore();
    setLoginRateLimitStore(mock as unknown as RedisRateLimitStore);

    clearLoginAttempts('reset@test.com');
    await flushMicrotasks();

    expect(mock.reset).toHaveBeenCalledTimes(1);
    expect(mock.reset.mock.calls[0][0]).toBe('login-attempts:reset@test.com');
  });

  it('fails open when Redis increment rejects (does not throw)', async () => {
    const mock = makeMockRedisStore({
      increment: jest
        .fn<ReturnType<IncrementFn>, Parameters<IncrementFn>>()
        .mockRejectedValue(new Error('redis down')),
    });
    setLoginRateLimitStore(mock as unknown as RedisRateLimitStore);

    // Should not throw synchronously or asynchronously
    expect(() => {
      recordFailedLogin('fail-open@test.com');
    }).not.toThrow();
    await flushMicrotasks();

    // Local snapshot increment still happened (sync path) — brute-force still bounded locally
    for (let i = 0; i < 9; i++) {
      recordFailedLogin('fail-open@test.com');
    }
    await flushMicrotasks();
    expect(() => {
      checkLoginRateLimit('fail-open@test.com');
    }).toThrow('Too many login attempts');
  });

  it('fails open when Redis reset rejects (does not throw, still clears local)', async () => {
    // Seed 10 failures locally with Redis disabled so the snapshot is authoritative
    setLoginRateLimitStore(null);
    for (let i = 0; i < 10; i++) {
      recordFailedLogin('fail-clear@test.com');
    }
    expect(() => {
      checkLoginRateLimit('fail-clear@test.com');
    }).toThrow();

    // Now install a Redis store whose reset rejects
    const mock = makeMockRedisStore({
      reset: jest
        .fn<ReturnType<ResetFn>, Parameters<ResetFn>>()
        .mockRejectedValue(new Error('redis down')),
    });
    setLoginRateLimitStore(mock as unknown as RedisRateLimitStore);

    // Clear should succeed locally even though Redis throws
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
    }).toThrow('Too many login attempts');
  });
});
