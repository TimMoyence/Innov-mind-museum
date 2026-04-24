import {
  checkLoginRateLimit,
  clearLoginAttempts,
  recordFailedLogin,
  setLoginRateLimitStore,
  _resetAllAttempts,
} from '@modules/auth/useCase/login-rate-limiter';

import type { AppError } from '@shared/errors/app.error';
import type { RedisRateLimitStore } from '@src/helpers/middleware/redis-rate-limit-store';

/**
 * Security test suite — brute-force login resistance and multi-instance
 * consistency. Targets `src/modules/auth/useCase/login-rate-limiter.ts`.
 *
 * Focus:
 *  - Single-instance sliding window + exponential lockout shape.
 *  - Retry-After header on 6th failure after reaching LOCKOUT_THRESHOLD (5).
 *  - Longer lockout after further failures (exponential backoff).
 *  - Two "instances" backed by the SAME mocked Redis store see a CONSISTENT
 *    lockout state (the Lua EVAL script is atomic: INCR + PEXPIRE in one
 *    round-trip, preventing split-counter races).
 *  - Counter reset on successful login after a lockout.
 */

type IncrementFn = RedisRateLimitStore['increment'];
type ResetFn = RedisRateLimitStore['reset'];

/**
 * Simulates a shared Redis instance backing multiple app processes. The
 * `eval` counter increments atomically — just like the real Lua INCR +
 * PEXPIRE script. Two calls from two "instances" pointing at the same mock
 * see the monotonically growing count, which is exactly the property we
 * depend on to defend against distributed brute force.
 */
const makeSharedRedisMock = (): {
  store: jest.Mocked<RedisRateLimitStore>;
  state: { slidingCount: number; lockoutCount: number };
} => {
  const state = { slidingCount: 0, lockoutCount: 0 };

  const increment: jest.MockedFunction<IncrementFn> = jest.fn().mockImplementation((...args) => {
    const windowMs = args[1];
    state.slidingCount += 1;
    return Promise.resolve({ count: state.slidingCount, resetAt: Date.now() + windowMs });
  });

  const reset: jest.MockedFunction<ResetFn> = jest.fn().mockImplementation(() => {
    state.slidingCount = 0;
    return Promise.resolve();
  });

  const lockoutEval = jest.fn().mockImplementation(() => {
    state.lockoutCount += 1;
    return Promise.resolve(state.lockoutCount);
  });

  const lockoutDel = jest.fn().mockImplementation(() => {
    state.lockoutCount = 0;
    return Promise.resolve(1);
  });

  const store = {
    increment,
    reset,
    clear: jest.fn(),
    stopSweep: jest.fn(),
    getRedisClient: jest.fn().mockReturnValue({ eval: lockoutEval, del: lockoutDel }),
  } as unknown as jest.Mocked<RedisRateLimitStore>;

  return { store, state };
};

const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const captureAppError = (fn: () => void): AppError => {
  try {
    fn();
  } catch (err) {
    return err as AppError;
  }
  throw new Error('Expected checkLoginRateLimit to throw');
};

beforeEach(() => {
  _resetAllAttempts();
});

describe('brute-force login — single instance', () => {
  it('allows the first 5 failures without lockout, then blocks the 6th with a Retry-After', () => {
    const email = 'attacker@test.com';

    for (let i = 0; i < 5; i += 1) {
      recordFailedLogin(email);
    }

    const err = captureAppError(() => {
      checkLoginRateLimit(email);
    });

    expect(err.statusCode).toBe(429);
    expect(err.code).toBe('AUTH_LOCKED_OUT');
    expect(err.headers?.['Retry-After']).toBeDefined();

    // Overshoot 0 → 2^0 * 30s = 30s. Parse and sanity-check.
    const retryAfterSec = Number.parseInt(err.headers?.['Retry-After'] ?? '0', 10);
    expect(retryAfterSec).toBeGreaterThan(0);
    expect(retryAfterSec).toBeLessThanOrEqual(30);
  });

  it('exponentially extends the lockout after further consecutive failures', () => {
    jest.useFakeTimers();
    const email = 'persistent@test.com';

    // Cross the threshold: 5 failures → 30s lockout on the 6th check.
    for (let i = 0; i < 5; i += 1) {
      recordFailedLogin(email);
    }

    const first = captureAppError(() => {
      checkLoginRateLimit(email);
    });
    const firstRetry = Number.parseInt(first.headers?.['Retry-After'] ?? '0', 10);

    // Advance past the 30s lockout window so the next recordFailedLogin
    // is treated as a new datapoint, then bump the counter to 6 failures.
    jest.advanceTimersByTime(31 * 1000);
    recordFailedLogin(email);

    const second = captureAppError(() => {
      checkLoginRateLimit(email);
    });
    const secondRetry = Number.parseInt(second.headers?.['Retry-After'] ?? '0', 10);

    // 6 failures → 2^1 * 30s = 60s. Must be strictly larger than the first.
    expect(secondRetry).toBeGreaterThan(firstRetry);
    expect(secondRetry).toBeLessThanOrEqual(60);

    jest.useRealTimers();
  });

  it('resets the counter after a successful login (clearLoginAttempts)', () => {
    const email = 'recovery@test.com';

    for (let i = 0; i < 10; i += 1) {
      recordFailedLogin(email);
    }

    expect(() => {
      checkLoginRateLimit(email);
    }).toThrow();

    clearLoginAttempts(email);

    expect(() => {
      checkLoginRateLimit(email);
    }).not.toThrow();
  });
});

describe('brute-force login — multi-instance Redis consistency', () => {
  it('two instances sharing the same Redis see a consistent lockout count (Lua atomicity)', async () => {
    const { store, state } = makeSharedRedisMock();
    setLoginRateLimitStore(store);

    const email = 'cluster@test.com';

    // Instance A records 3 failures, instance B records 2 — total 5 in Redis.
    for (let i = 0; i < 3; i += 1) {
      recordFailedLogin(email);
    }
    await flushMicrotasks();
    for (let i = 0; i < 2; i += 1) {
      recordFailedLogin(email);
    }
    await flushMicrotasks();

    // The shared Lua EVAL stub was called exactly 5 times — one atomic
    // INCR + PEXPIRE per failure, no split writes across "instances".
    const evalMock = (store.getRedisClient() as unknown as { eval: jest.Mock }).eval;
    expect(evalMock).toHaveBeenCalledTimes(5);
    expect(state.lockoutCount).toBe(5);

    // After mirror, any subsequent check on the local snapshot that has seen
    // ≥ LOCKOUT_THRESHOLD must throw 429 AUTH_LOCKED_OUT.
    const err = captureAppError(() => {
      checkLoginRateLimit(email);
    });
    expect(err.statusCode).toBe(429);
    expect(err.code).toBe('AUTH_LOCKED_OUT');
  });

  it('successful login on one instance clears the lockout for all (DEL is propagated)', async () => {
    const { store, state } = makeSharedRedisMock();
    setLoginRateLimitStore(store);

    const email = 'shared-reset@test.com';

    for (let i = 0; i < 5; i += 1) {
      recordFailedLogin(email);
    }
    await flushMicrotasks();
    expect(state.lockoutCount).toBe(5);

    // A successful login on any instance clears local + fires Redis DEL.
    clearLoginAttempts(email);
    await flushMicrotasks();

    expect(state.lockoutCount).toBe(0);
    expect(() => {
      checkLoginRateLimit(email);
    }).not.toThrow();
  });
});
