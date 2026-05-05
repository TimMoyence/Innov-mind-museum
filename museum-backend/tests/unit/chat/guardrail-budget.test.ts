/**
 * F4 (2026-04-30) + ADR-030 (2026-05-05) — guardrail budget helper tests.
 *
 * Covers the in-process backend (memory) and the Redis backend wired through
 * a stub CacheService. Daily reset is exercised via the `__setNowForTest`
 * clock seam.
 */
import { type CacheService } from '@shared/cache/cache.port';

import {
  __setNowForTest,
  __setStoreForTest,
  configureGuardrailBudget,
  getBudgetExhausted,
  recordJudgeCost,
  resetBudget,
} from '@modules/chat/useCase/guardrail/guardrail-budget';

import { InMemoryCacheService } from '../../helpers/cache/inMemoryCacheService';

describe('guardrail-budget (in-process backend)', () => {
  beforeEach(async () => {
    process.env.GUARDRAIL_BUDGET_BACKEND = 'memory';
    __setStoreForTest(null);
    __setNowForTest(undefined);
    await resetBudget();
  });

  it('starts un-exhausted', async () => {
    expect(await getBudgetExhausted()).toBe(false);
  });

  it('stays un-exhausted while cumulative cost is under the cap', async () => {
    await recordJudgeCost(50);
    await recordJudgeCost(100);
    await recordJudgeCost(200);
    expect(await getBudgetExhausted()).toBe(false);
  });

  it('flips to exhausted once cumulative cost meets the cap', async () => {
    await recordJudgeCost(300);
    await recordJudgeCost(150);
    expect(await getBudgetExhausted()).toBe(false);
    await recordJudgeCost(60);
    expect(await getBudgetExhausted()).toBe(true);
  });

  it('stays exhausted on further cost recording within the same day', async () => {
    await recordJudgeCost(600);
    expect(await getBudgetExhausted()).toBe(true);
    await recordJudgeCost(1);
    expect(await getBudgetExhausted()).toBe(true);
  });

  it('resets after UTC midnight rollover', async () => {
    __setNowForTest(new Date('2026-04-30T12:00:00Z'));
    await recordJudgeCost(600);
    expect(await getBudgetExhausted()).toBe(true);

    __setNowForTest(new Date('2026-05-01T00:30:00Z'));
    expect(await getBudgetExhausted()).toBe(false);
    await recordJudgeCost(50);
    expect(await getBudgetExhausted()).toBe(false);
  });

  it('resetBudget() force-clears the counter for tests', async () => {
    await recordJudgeCost(600);
    expect(await getBudgetExhausted()).toBe(true);
    await resetBudget();
    expect(await getBudgetExhausted()).toBe(false);
  });

  it('ignores non-positive cost recordings (defensive)', async () => {
    await recordJudgeCost(0);
    await recordJudgeCost(-50);
    expect(await getBudgetExhausted()).toBe(false);
  });
});

describe('guardrail-budget (redis backend via stub CacheService)', () => {
  let cache: InMemoryCacheService;

  beforeEach(() => {
    cache = new InMemoryCacheService();
    process.env.GUARDRAIL_BUDGET_BACKEND = 'redis';
    __setStoreForTest(null);
    __setNowForTest(undefined);
    configureGuardrailBudget({ cache });
  });

  afterEach(() => {
    process.env.GUARDRAIL_BUDGET_BACKEND = 'memory';
    __setStoreForTest(null);
    __setNowForTest(undefined);
  });

  it('writes a single counter key per UTC day', async () => {
    __setNowForTest(new Date('2026-05-05T10:00:00Z'));
    await recordJudgeCost(120);
    expect(cache.has('guardrail:judge:budget:2026-05-05')).toBe(true);
  });

  it('accumulates cost across calls atomically', async () => {
    __setNowForTest(new Date('2026-05-05T10:00:00Z'));
    await recordJudgeCost(100);
    await recordJudgeCost(150);
    await recordJudgeCost(200);
    expect(await getBudgetExhausted()).toBe(false);
    await recordJudgeCost(60);
    expect(await getBudgetExhausted()).toBe(true);
  });

  it('uses a different key after UTC midnight rollover (no spillover)', async () => {
    __setNowForTest(new Date('2026-05-05T23:55:00Z'));
    await recordJudgeCost(600);
    expect(await getBudgetExhausted()).toBe(true);

    __setNowForTest(new Date('2026-05-06T00:05:00Z'));
    expect(await getBudgetExhausted()).toBe(false);
    expect(cache.has('guardrail:judge:budget:2026-05-06')).toBe(false);
  });

  it('resetBudget() deletes the current-day key', async () => {
    __setNowForTest(new Date('2026-05-05T10:00:00Z'));
    await recordJudgeCost(600);
    expect(cache.has('guardrail:judge:budget:2026-05-05')).toBe(true);
    await resetBudget();
    expect(cache.has('guardrail:judge:budget:2026-05-05')).toBe(false);
  });

  it('fails CLOSED when the cache returns a malformed counter', async () => {
    __setNowForTest(new Date('2026-05-05T10:00:00Z'));

    await cache.set('guardrail:judge:budget:2026-05-05', 'NaN-from-redis');

    expect(await getBudgetExhausted()).toBe(true);
  });

  it('fails CLOSED when get() returns a negative counter (corrupted)', async () => {
    __setNowForTest(new Date('2026-05-05T10:00:00Z'));
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
});
