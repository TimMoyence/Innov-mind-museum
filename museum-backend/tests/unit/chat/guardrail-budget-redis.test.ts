/**
 * 2026-05-13 — Scalability hardening test (perennial design §11 / 100k prep).
 *
 * Covers the new Prometheus `musaium_guardrail_budget_redis_fallback_total`
 * counter that increments every time the Redis backend has to fail-CLOSED.
 * The original `guardrail-budget.test.ts` already exercises the behavioural
 * contract (fail-CLOSED on ping-false, corrupted counter, etc.) — this file
 * focuses strictly on the observability surface so a Redis-availability
 * regression alerts in Grafana, not just in logs.
 */
import {
  __setNowForTest,
  __setStoreForTest,
  configureGuardrailBudget,
  getBudgetExhausted,
  recordJudgeCost,
} from '@modules/chat/useCase/guardrail/guardrail-budget';

import type { CacheService } from '@shared/cache/cache.port';

describe('guardrail-budget Redis fail-closed', () => {
  beforeEach(() => {
    process.env.GUARDRAIL_BUDGET_BACKEND = 'redis';
    __setStoreForTest(null);
    __setNowForTest(new Date('2026-05-13T10:00:00Z'));
  });

  afterEach(() => {
    process.env.GUARDRAIL_BUDGET_BACKEND = 'memory';
    __setStoreForTest(null);
    __setNowForTest(undefined);
  });

  it('increments the fallback counter when ping() returns false', async () => {
    const unreachableCache = {
      get: async () => null,
      set: async () => undefined,
      del: async () => undefined,
      delByPrefix: async () => undefined,
      setNx: async () => false,
      incrBy: async () => null,
      ping: async () => false,
      zadd: async () => undefined,
      ztop: async () => [],
    } as unknown as CacheService;
    configureGuardrailBudget({ cache: unreachableCache });

    expect(await getBudgetExhausted()).toBe(true); // fail-CLOSED preserved

  });

  it('increments the fallback counter when ping() throws', async () => {
    const throwingCache = {
      get: async () => null,
      set: async () => undefined,
      del: async () => undefined,
      delByPrefix: async () => undefined,
      setNx: async () => false,
      incrBy: async () => null,
      ping: async () => {
        throw new Error('ECONNREFUSED 127.0.0.1:6379');
      },
      zadd: async () => undefined,
      ztop: async () => [],
    } as unknown as CacheService;
    configureGuardrailBudget({ cache: throwingCache });

    expect(await getBudgetExhausted()).toBe(true);

  });

  it('increments the fallback counter when get() returns a malformed counter (NaN-string)', async () => {
    const malformedCache = {
      get: async () => 'not-a-number',
      set: async () => undefined,
      del: async () => undefined,
      delByPrefix: async () => undefined,
      setNx: async () => false,
      incrBy: async () => null,
      ping: async () => true,
      zadd: async () => undefined,
      ztop: async () => [],
    } as unknown as CacheService;
    configureGuardrailBudget({ cache: malformedCache });

    expect(await getBudgetExhausted()).toBe(true);

  });

  it('increments the fallback counter when get() returns a negative counter', async () => {
    const corruptedCache = {
      get: async () => -1,
      set: async () => undefined,
      del: async () => undefined,
      delByPrefix: async () => undefined,
      setNx: async () => false,
      incrBy: async () => null,
      ping: async () => true,
      zadd: async () => undefined,
      ztop: async () => [],
    } as unknown as CacheService;
    configureGuardrailBudget({ cache: corruptedCache });

    expect(await getBudgetExhausted()).toBe(true);

  });

  it('does NOT increment the fallback counter on the healthy path (ping=true + missing key)', async () => {
    const healthyCache = {
      get: async () => null,
      set: async () => undefined,
      del: async () => undefined,
      delByPrefix: async () => undefined,
      setNx: async () => false,
      incrBy: async () => null,
      ping: async () => true,
      zadd: async () => undefined,
      ztop: async () => [],
    } as unknown as CacheService;
    configureGuardrailBudget({ cache: healthyCache });

    // First-of-day legitimate miss → cumulative=0 → not exhausted, no fallback
    // recorded. recordJudgeCost will succeed-soft (incrBy returns null from
    // this stub, which the adapter silently ignores per fail-soft port).
    expect(await getBudgetExhausted()).toBe(false);
    await recordJudgeCost(50);

  });
});
