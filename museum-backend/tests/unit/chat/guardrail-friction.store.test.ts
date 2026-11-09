import { type CacheService } from '@shared/cache/cache.port';

import {
  __setNowForTest,
  __setStoreForTest,
  configureGuardrailFriction,
  recordStrike,
  frictionCount,
  armCoolDown,
  isCoolingDown,
  resetFriction,
} from '@modules/chat/useCase/guardrail/guardrail-friction.store';

import { InMemoryCacheService } from '../../helpers/cache/inMemoryCacheService';

import type { FrictionScope } from '@modules/chat/useCase/guardrail/guardrail-friction.store';

const SESSION_SCOPE: FrictionScope = { kind: 'session', sessionId: 'sess-abc' };
const USER_SCOPE: FrictionScope = { kind: 'user', userId: 42 };
const IP_SCOPE: FrictionScope = { kind: 'ip', ipHash: 'a'.repeat(64) };

describe('guardrail-friction (in-process backend)', () => {
  beforeEach(async () => {
    process.env.GUARDRAIL_FRICTION_BACKEND = 'memory';
    __setStoreForTest(null);
    __setNowForTest(undefined);
    await resetFriction(SESSION_SCOPE);
    await resetFriction(USER_SCOPE);
    await resetFriction(IP_SCOPE);
  });

  it('starts at zero strikes for every scope', async () => {
    expect(await frictionCount(SESSION_SCOPE)).toBe(0);
    expect(await frictionCount(USER_SCOPE)).toBe(0);
    expect(await frictionCount(IP_SCOPE)).toBe(0);
  });

  it('accumulates strikes by weight within a scope', async () => {
    await recordStrike(SESSION_SCOPE, 1);
    await recordStrike(SESSION_SCOPE, 1);
    await recordStrike(SESSION_SCOPE, 2);
    expect(await frictionCount(SESSION_SCOPE)).toBe(4);
  });

  it('keeps strike counters isolated per scope', async () => {
    await recordStrike(SESSION_SCOPE, 3);
    await recordStrike(USER_SCOPE, 1);
    expect(await frictionCount(SESSION_SCOPE)).toBe(3);
    expect(await frictionCount(USER_SCOPE)).toBe(1);
    expect(await frictionCount(IP_SCOPE)).toBe(0);
  });

  it('ignores non-positive / non-finite weights (defensive)', async () => {
    await recordStrike(SESSION_SCOPE, 0);
    await recordStrike(SESSION_SCOPE, -2);
    await recordStrike(SESSION_SCOPE, Number.NaN);
    await recordStrike(SESSION_SCOPE, Number.POSITIVE_INFINITY);
    expect(await frictionCount(SESSION_SCOPE)).toBe(0);
  });

  it('reset() force-clears a single scope only', async () => {
    await recordStrike(SESSION_SCOPE, 5);
    await recordStrike(USER_SCOPE, 5);
    await resetFriction(SESSION_SCOPE);
    expect(await frictionCount(SESSION_SCOPE)).toBe(0);
    expect(await frictionCount(USER_SCOPE)).toBe(5);
  });

  it('arms and reports a cool-down flag per scope', async () => {
    expect(await isCoolingDown(USER_SCOPE)).toBe(false);
    await armCoolDown(USER_SCOPE);
    expect(await isCoolingDown(USER_SCOPE)).toBe(true);
    expect(await isCoolingDown(SESSION_SCOPE)).toBe(false);
  });
});

describe('guardrail-friction (redis backend via stub CacheService)', () => {
  let cache: InMemoryCacheService;

  beforeEach(() => {
    cache = new InMemoryCacheService();
    process.env.GUARDRAIL_FRICTION_BACKEND = 'redis';
    __setStoreForTest(null);
    __setNowForTest(undefined);
    configureGuardrailFriction({ cache });
  });

  afterEach(() => {
    process.env.GUARDRAIL_FRICTION_BACKEND = 'memory';
    __setStoreForTest(null);
    __setNowForTest(undefined);
  });

  it('writes a strike counter under a session-scoped key', async () => {
    await recordStrike(SESSION_SCOPE, 1);
    expect(cache.has('friction:session:sess-abc')).toBe(true);
  });

  it('writes a strike counter under a user-scoped key', async () => {
    await recordStrike(USER_SCOPE, 1);
    expect(cache.has('friction:user:42')).toBe(true);
  });

  it('stores the HASHED ip in the key, never the raw value', async () => {
    await recordStrike(IP_SCOPE, 1);
    expect(cache.has(`friction:ip:${'a'.repeat(64)}`)).toBe(true);
  });

  it('accumulates strikes atomically through the cache backend', async () => {
    await recordStrike(USER_SCOPE, 2);
    await recordStrike(USER_SCOPE, 1);
    expect(await frictionCount(USER_SCOPE)).toBe(3);
  });

  it('arms a cool-down key that isCoolingDown() reads back as true', async () => {
    await armCoolDown(USER_SCOPE);
    expect(await isCoolingDown(USER_SCOPE)).toBe(true);
  });

  it('reset() deletes the scope key', async () => {
    await recordStrike(SESSION_SCOPE, 4);
    expect(cache.has('friction:session:sess-abc')).toBe(true);
    await resetFriction(SESSION_SCOPE);
    expect(cache.has('friction:session:sess-abc')).toBe(false);
  });

  it('FAIL-SOFT: count() returns 0 (NOT Infinity) when get() throws', async () => {
    const throwingCache = {
      get: async () => {
        throw new Error('ECONNREFUSED 127.0.0.1:6379');
      },
      set: async () => undefined,
      del: async () => undefined,
      delByPrefix: async () => undefined,
      setNx: async () => false,
      incrBy: async () => null,
      ping: async () => false,
      zadd: async () => undefined,
      ztop: async () => [],
    } as unknown as CacheService;
    configureGuardrailFriction({ cache: throwingCache });

    await expect(frictionCount(USER_SCOPE)).resolves.toBe(0);
  });

  it('FAIL-SOFT: count() returns 0 when ping is down (no escalation on outage)', async () => {
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
    configureGuardrailFriction({ cache: unreachableCache });

    expect(await frictionCount(SESSION_SCOPE)).toBe(0);
  });

  it('FAIL-SOFT: isCoolingDown() returns false when get() throws (never blocks on outage)', async () => {
    const throwingCache = {
      get: async () => {
        throw new Error('redis down');
      },
      set: async () => undefined,
      del: async () => undefined,
      delByPrefix: async () => undefined,
      setNx: async () => false,
      incrBy: async () => null,
      ping: async () => false,
      zadd: async () => undefined,
      ztop: async () => [],
    } as unknown as CacheService;
    configureGuardrailFriction({ cache: throwingCache });

    await expect(isCoolingDown(USER_SCOPE)).resolves.toBe(false);
  });

  it('FAIL-SOFT: recordStrike() swallows a backend error instead of throwing', async () => {
    const throwingCache = {
      get: async () => null,
      set: async () => undefined,
      del: async () => undefined,
      delByPrefix: async () => undefined,
      setNx: async () => false,
      incrBy: async () => {
        throw new Error('redis down on write');
      },
      ping: async () => false,
      zadd: async () => undefined,
      ztop: async () => [],
    } as unknown as CacheService;
    configureGuardrailFriction({ cache: throwingCache });

    await expect(recordStrike(USER_SCOPE, 1)).resolves.toBeUndefined();
  });
});
