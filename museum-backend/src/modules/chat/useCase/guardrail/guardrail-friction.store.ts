import { createHash } from 'node:crypto';

import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import type { CacheService } from '@shared/cache/cache.port';

export type FrictionScope =
  | { kind: 'session'; sessionId: string }
  | { kind: 'user'; userId: number }
  | { kind: 'ip'; ipHash: string };

export interface IGuardrailFrictionStore {
  recordStrike(scope: FrictionScope, weight: number): Promise<void>;
  count(scope: FrictionScope): Promise<number>;
  armCoolDown(scope: FrictionScope): Promise<void>;
  isCoolingDown(scope: FrictionScope): Promise<boolean>;
  reset(scope: FrictionScope): Promise<void>;
}

let nowProvider: () => Date = () => new Date();

const KEY_PREFIX = 'friction:';
const COOLDOWN_PREFIX = 'friction:cooldown:';

const msToSec = (ms: number): number => Math.max(1, Math.floor(ms / 1000));

export const hashIp = (ip: string): string => createHash('sha256').update(ip).digest('hex');

const scopeId = (scope: FrictionScope): string => {
  switch (scope.kind) {
    case 'session':
      return scope.sessionId;
    case 'user':
      return String(scope.userId);
    case 'ip':
      return scope.ipHash;
  }
};

const scopeKey = (scope: FrictionScope): string => `${KEY_PREFIX}${scope.kind}:${scopeId(scope)}`;
const cooldownKey = (scope: FrictionScope): string =>
  `${COOLDOWN_PREFIX}${scope.kind}:${scopeId(scope)}`;

const ttlSecForScope = (scope: FrictionScope): number => {
  if (scope.kind === 'session') return msToSec(env.guardrails.frictionSessionTtlMs);
  return msToSec(env.guardrails.frictionUserTtlMs);
};

class InProcessGuardrailFrictionStore implements IGuardrailFrictionStore {
  private readonly strikes = new Map<string, number>();
  private readonly cooldowns = new Map<string, number>();

  recordStrike(scope: FrictionScope, weight: number): Promise<void> {
    if (weight <= 0 || !Number.isFinite(weight)) return Promise.resolve();
    const key = scopeKey(scope);
    this.strikes.set(key, (this.strikes.get(key) ?? 0) + Math.trunc(weight));

    return Promise.resolve();
  }

  count(scope: FrictionScope): Promise<number> {
    return Promise.resolve(this.strikes.get(scopeKey(scope)) ?? 0);
  }

  armCoolDown(scope: FrictionScope): Promise<void> {
    const expiresAt = nowProvider().getTime() + env.guardrails.frictionCooldownMs;
    this.cooldowns.set(cooldownKey(scope), expiresAt);

    return Promise.resolve();
  }

  isCoolingDown(scope: FrictionScope): Promise<boolean> {
    const expiresAt = this.cooldowns.get(cooldownKey(scope));
    if (expiresAt === undefined) return Promise.resolve(false);
    if (nowProvider().getTime() > expiresAt) {
      this.cooldowns.delete(cooldownKey(scope));
      return Promise.resolve(false);
    }
    return Promise.resolve(true);
  }

  reset(scope: FrictionScope): Promise<void> {
    this.strikes.delete(scopeKey(scope));
    this.cooldowns.delete(cooldownKey(scope));

    return Promise.resolve();
  }
}

class RedisGuardrailFrictionStore implements IGuardrailFrictionStore {
  constructor(private readonly cache: CacheService) {}

  private onFallback(op: string, scope: FrictionScope, error: unknown): void {
    logger.warn('guardrail_friction_redis_fail_soft', {
      op,
      scope: scope.kind,
      error: errorMessage(error),
    });
  }

  async recordStrike(scope: FrictionScope, weight: number): Promise<void> {
    if (weight <= 0 || !Number.isFinite(weight)) return;
    try {
      await this.cache.incrBy(scopeKey(scope), Math.trunc(weight), ttlSecForScope(scope));
    } catch (error) {
      this.onFallback('recordStrike', scope, error);
    }
  }

  async count(scope: FrictionScope): Promise<number> {
    try {
      const value = await this.cache.get<number>(scopeKey(scope));
      if (value === null || !Number.isFinite(value) || value < 0) return 0;
      return value;
    } catch (error) {
      this.onFallback('count', scope, error);
      return 0;
    }
  }

  async armCoolDown(scope: FrictionScope): Promise<void> {
    try {
      await this.cache.set(cooldownKey(scope), 1, msToSec(env.guardrails.frictionCooldownMs));
    } catch (error) {
      this.onFallback('armCoolDown', scope, error);
    }
  }

  async isCoolingDown(scope: FrictionScope): Promise<boolean> {
    try {
      return (await this.cache.get<number>(cooldownKey(scope))) !== null;
    } catch (error) {
      this.onFallback('isCoolingDown', scope, error);
      return false;
    }
  }

  async reset(scope: FrictionScope): Promise<void> {
    try {
      await this.cache.del(scopeKey(scope));
      await this.cache.del(cooldownKey(scope));
    } catch (error) {
      this.onFallback('reset', scope, error);
    }
  }
}

let store: IGuardrailFrictionStore | null = null;

const useRedisBackend = (): boolean => process.env.GUARDRAIL_FRICTION_BACKEND !== 'memory';

export function configureGuardrailFriction(deps: { cache?: CacheService }): void {
  if (useRedisBackend()) {
    if (deps.cache === undefined) {
      logger.warn('guardrail_friction_redis_unavailable', {
        detail:
          'GUARDRAIL_FRICTION_BACKEND=redis but no CacheService injected — falling back to in-process counter',
      });
      store = new InProcessGuardrailFrictionStore();
      return;
    }
    store = new RedisGuardrailFrictionStore(deps.cache);
    return;
  }
  store = new InProcessGuardrailFrictionStore();
}

function ensureStore(): IGuardrailFrictionStore {
  store ??= new InProcessGuardrailFrictionStore();
  return store;
}

export const recordStrike = async (scope: FrictionScope, weight: number): Promise<void> => {
  await ensureStore().recordStrike(scope, weight);
};

export const frictionCount = async (scope: FrictionScope): Promise<number> => {
  return await ensureStore().count(scope);
};

export const armCoolDown = async (scope: FrictionScope): Promise<void> => {
  await ensureStore().armCoolDown(scope);
};

export const isCoolingDown = async (scope: FrictionScope): Promise<boolean> => {
  return await ensureStore().isCoolingDown(scope);
};

export const resetFriction = async (scope: FrictionScope): Promise<void> => {
  await ensureStore().reset(scope);
};

export const __setNowForTest = (date: Date | undefined): void => {
  nowProvider = date ? () => date : () => new Date();
};

export const __setStoreForTest = (next: IGuardrailFrictionStore | null): void => {
  store = next;
};
