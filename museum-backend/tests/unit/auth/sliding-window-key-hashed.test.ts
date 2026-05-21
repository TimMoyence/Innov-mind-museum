import { createHash } from 'node:crypto';

import {
  recordFailedLogin,
  clearLoginAttempts,
  setLoginRateLimitStore,
  _resetAllAttempts,
} from '@modules/auth/useCase/session/login-rate-limiter';

import type { RedisRateLimitStore } from '@shared/middleware/redis-rate-limit-store';

/**
 * RED (UFR-022) — I-SEC6 / spec R8.
 * The sliding-window Redis key MUST be derived by hashing the normalized email
 * (same approach as the already-hardened lockout key), so raw email PII never
 * lands in the Redis keyspace. Today `slidingRedisKey` interpolates the raw email
 * (`login-attempts:<email>`, login-rate-limiter.ts:96), so the assertions below
 * are RED until the GREEN phase hashes the key.
 *
 * `slidingRedisKey` is module-private; per design D4 we observe the derived key
 * indirectly via the first argument passed to the injected store's `increment`
 * (recordFailedLogin) and `reset` (clearLoginAttempts).
 */

const KEY_PREFIX = 'login-attempts:';
const VICTIM_EMAIL = 'victim@example.com';
const EXPECTED_HASH = createHash('sha1').update(VICTIM_EMAIL).digest('hex');

type IncrementFn = RedisRateLimitStore['increment'];
type ResetFn = RedisRateLimitStore['reset'];

interface SpyStore {
  store: jest.Mocked<RedisRateLimitStore>;
  increment: jest.MockedFunction<IncrementFn>;
  reset: jest.MockedFunction<ResetFn>;
}

const makeSpyStore = (): SpyStore => {
  const increment = jest
    .fn<ReturnType<IncrementFn>, Parameters<IncrementFn>>()
    .mockImplementation((...args) => Promise.resolve({ count: 1, resetAt: Date.now() + args[1] }));
  const reset = jest.fn<ReturnType<ResetFn>, Parameters<ResetFn>>().mockResolvedValue(undefined);

  const store = {
    increment,
    reset,
    clear: jest.fn(),
    stopSweep: jest.fn(),
    getRedisClient: jest.fn().mockReturnValue({
      eval: jest.fn().mockResolvedValue(1),
      del: jest.fn().mockResolvedValue(1),
    }),
  } as unknown as jest.Mocked<RedisRateLimitStore>;

  return { store, increment, reset };
};

const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

beforeEach(() => {
  _resetAllAttempts();
});

describe('login-rate-limiter — sliding-window key is hashed (I-SEC6 / R8)', () => {
  it('does NOT pass the raw email into the sliding-window increment key', async () => {
    const { store, increment } = makeSpyStore();
    setLoginRateLimitStore(store);

    recordFailedLogin(VICTIM_EMAIL);
    await flushMicrotasks();

    expect(increment).toHaveBeenCalledTimes(1);
    const key = increment.mock.calls[0][0];
    expect(key).not.toContain('@');
    expect(key).not.toContain(VICTIM_EMAIL);
    expect(key).not.toBe(`${KEY_PREFIX}${VICTIM_EMAIL}`);
  });

  it('derives the sliding-window key as <prefix><hex-hash>', async () => {
    const { store, increment } = makeSpyStore();
    setLoginRateLimitStore(store);

    recordFailedLogin(VICTIM_EMAIL);
    await flushMicrotasks();

    const key = increment.mock.calls[0][0];
    expect(key).toMatch(/^login-attempts:[0-9a-f]+$/);
    expect(key).toBe(`${KEY_PREFIX}${EXPECTED_HASH}`);
  });

  it('hashes the email for the sliding-window reset key too (clearLoginAttempts)', async () => {
    const { store, reset } = makeSpyStore();
    setLoginRateLimitStore(store);

    clearLoginAttempts(VICTIM_EMAIL);
    await flushMicrotasks();

    expect(reset).toHaveBeenCalledTimes(1);
    const key = reset.mock.calls[0][0];
    expect(key).not.toContain('@');
    expect(key).toMatch(/^login-attempts:[0-9a-f]+$/);
  });
});
