import {
  checkLoginRateLimit,
  clearLoginAttempts,
  recordFailedLogin,
  setLoginRateLimitStore,
  _resetAllAttempts,
} from '@modules/auth/useCase/session/login-rate-limiter';

import type { AppError } from '@shared/errors/app.error';
import type { RedisRateLimitStore } from '@shared/middleware/redis-rate-limit-store';

type IncrementFn = RedisRateLimitStore['increment'];
type ResetFn = RedisRateLimitStore['reset'];

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

    const retryAfterSec = Number.parseInt(err.headers?.['Retry-After'] ?? '0', 10);
    expect(retryAfterSec).toBeGreaterThan(0);
    expect(retryAfterSec).toBeLessThanOrEqual(30);
  });

  it('exponentially extends the lockout after further consecutive failures', () => {
    jest.useFakeTimers();
    const email = 'persistent@test.com';

    for (let i = 0; i < 5; i += 1) {
      recordFailedLogin(email);
    }

    const first = captureAppError(() => {
      checkLoginRateLimit(email);
    });
    const firstRetry = Number.parseInt(first.headers?.['Retry-After'] ?? '0', 10);

    jest.advanceTimersByTime(31 * 1000);
    recordFailedLogin(email);

    const second = captureAppError(() => {
      checkLoginRateLimit(email);
    });
    const secondRetry = Number.parseInt(second.headers?.['Retry-After'] ?? '0', 10);

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

    for (let i = 0; i < 3; i += 1) {
      recordFailedLogin(email);
    }
    await flushMicrotasks();
    for (let i = 0; i < 2; i += 1) {
      recordFailedLogin(email);
    }
    await flushMicrotasks();

    const evalMock = (store.getRedisClient() as unknown as { eval: jest.Mock }).eval;
    expect(evalMock).toHaveBeenCalledTimes(5);
    expect(state.lockoutCount).toBe(5);

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

    clearLoginAttempts(email);
    await flushMicrotasks();

    expect(state.lockoutCount).toBe(0);
    expect(() => {
      checkLoginRateLimit(email);
    }).not.toThrow();
  });
});
