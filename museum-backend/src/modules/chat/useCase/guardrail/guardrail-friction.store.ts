/**
 * Hybrid-gravity guardrail (2026-06-01) — two-level friction counter.
 *
 * Modelled on `guardrail-budget.ts` (same CacheService.incrBy + TTL shape,
 * same in-process / redis adapter split, same `__setStoreForTest` /
 * `__setNowForTest` seams), but the FAIL POLICY IS INVERTED:
 *
 *   - budget store  = FAIL-CLOSED — a Redis outage returns `Infinity` so the
 *     judge is disabled (cost safety).
 *   - friction store = FAIL-SOFT  — a Redis outage returns `count() === 0` /
 *     `isCoolingDown() === false`, and `recordStrike()` swallows the error.
 *     A store outage MUST NEVER escalate a message nor 500 the chat (spec R14).
 *
 * Scopes (per `FrictionScope`):
 *   - session : `friction:session:<sessionId>`           TTL FRICTION_SESSION_TTL_MS
 *   - user    : `friction:user:<userId>`                  TTL FRICTION_USER_TTL_MS
 *   - ip      : `friction:ip:<sha256(ip)>`                TTL FRICTION_USER_TTL_MS
 * Cool-down flag: `friction:cooldown:<scope>` TTL FRICTION_COOLDOWN_MS.
 *
 * RGPD (NFR-RGPD-1): the `ip` scope carries an opaque sha256 hex digest only —
 * the raw IP is hashed BEFORE it ever reaches a key (see `hashIp`). No raw IP
 * is persisted or logged.
 *
 * Backend selection is read DYNAMICALLY from `GUARDRAIL_FRICTION_BACKEND`
 * (`'memory'` | anything-else → in-process) at configure / ensure time so a
 * test toggling the env var between cases is honoured without a module reload.
 */
import { createHash } from 'node:crypto';

import { logger } from '@shared/logger/logger';
import { guardrailFrictionRedisFallbackTotal } from '@shared/observability/prometheus-metrics';
import { env } from '@src/config/env';

import type { CacheService } from '@shared/cache/cache.port';

/** Strike scope — session (per chat), user (authenticated), or hashed IP (anon). */
export type FrictionScope =
  | { kind: 'session'; sessionId: string }
  | { kind: 'user'; userId: number }
  | { kind: 'ip'; ipHash: string };

/** Port consumed by the public functional API. Both adapters implement it. */
export interface IGuardrailFrictionStore {
  /** Adds `weight` strikes to `scope` + (re)applies TTL. Defensive against ≤0 / non-finite. */
  recordStrike(scope: FrictionScope, weight: number): Promise<void>;
  /** Current strike total for `scope`. FAIL-SOFT → 0 on store outage. */
  count(scope: FrictionScope): Promise<number>;
  /** Arms the cool-down flag for `scope` (TTL = FRICTION_COOLDOWN_MS). */
  armCoolDown(scope: FrictionScope): Promise<void>;
  /** True while a cool-down flag is armed for `scope`. FAIL-SOFT → false on outage. */
  isCoolingDown(scope: FrictionScope): Promise<boolean>;
  /** Force-clears a single scope (tests + optional defensive cron). */
  reset(scope: FrictionScope): Promise<void>;
}

// Test seam — overrideable clock (parity with guardrail-budget). The friction
// store does not currently key on the clock, but the seam is kept symmetric so
// future windowing logic can be exercised deterministically.
let nowProvider: () => Date = () => new Date();

const KEY_PREFIX = 'friction:';
const COOLDOWN_PREFIX = 'friction:cooldown:';

const msToSec = (ms: number): number => Math.max(1, Math.floor(ms / 1000));

/** sha256 hex of an IP — RGPD: the raw value never reaches a cache key. */
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

/** In-process adapter — per-process Maps. Dev / test / single-instance. */
class InProcessGuardrailFrictionStore implements IGuardrailFrictionStore {
  private readonly strikes = new Map<string, number>();
  private readonly cooldowns = new Map<string, number>(); // key → expiresAtMs

  // eslint-disable-next-line @typescript-eslint/require-await -- async port contract; in-memory mutation is synchronous
  async recordStrike(scope: FrictionScope, weight: number): Promise<void> {
    if (weight <= 0 || !Number.isFinite(weight)) return;
    const key = scopeKey(scope);
    this.strikes.set(key, (this.strikes.get(key) ?? 0) + Math.trunc(weight));
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- async port contract; in-memory read is synchronous
  async count(scope: FrictionScope): Promise<number> {
    return this.strikes.get(scopeKey(scope)) ?? 0;
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- async port contract; in-memory mutation is synchronous
  async armCoolDown(scope: FrictionScope): Promise<void> {
    const expiresAt = nowProvider().getTime() + env.guardrails.frictionCooldownMs;
    this.cooldowns.set(cooldownKey(scope), expiresAt);
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- async port contract; in-memory read is synchronous
  async isCoolingDown(scope: FrictionScope): Promise<boolean> {
    const expiresAt = this.cooldowns.get(cooldownKey(scope));
    if (expiresAt === undefined) return false;
    if (nowProvider().getTime() > expiresAt) {
      this.cooldowns.delete(cooldownKey(scope));
      return false;
    }
    return true;
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- async port contract; in-memory mutation is synchronous
  async reset(scope: FrictionScope): Promise<void> {
    this.strikes.delete(scopeKey(scope));
    this.cooldowns.delete(cooldownKey(scope));
  }
}

/**
 * Redis adapter — CacheService.incrBy for atomic counter + TTL.
 *
 * FAIL-SOFT policy (inverse of the budget store):
 *   - `count` / `isCoolingDown`: any throw → metric + warn → 0 / false. No
 *     ping-gate (a `null` from `get` is just a legitimate miss → 0).
 *   - `recordStrike` / `armCoolDown`: any throw → metric + warn → swallow. A
 *     write outage must not surface as a 500 on the chat hot path.
 */
class RedisGuardrailFrictionStore implements IGuardrailFrictionStore {
  constructor(private readonly cache: CacheService) {}

  private onFallback(op: string, scope: FrictionScope, error: unknown): void {
    guardrailFrictionRedisFallbackTotal.inc();
    logger.warn('guardrail_friction_redis_fail_soft', {
      op,
      scope: scope.kind,
      error: error instanceof Error ? error.message : String(error),
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

/** Reads the backend dynamically so a test can toggle it between cases. */
const useRedisBackend = (): boolean => process.env.GUARDRAIL_FRICTION_BACKEND !== 'memory';

/**
 * Wires the chosen backend at composition time (chat module boot) OR per-test.
 * - `GUARDRAIL_FRICTION_BACKEND !== 'memory'` AND a CacheService is provided →
 *   Redis adapter.
 * - redis selected but no CacheService → warn + in-process (a misconfigured
 *   CACHE_ENABLED=false deployment must not deadlock the friction layer).
 * - otherwise → in-process adapter.
 */
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
  // Defensive default — the composition root SHOULD have called
  // `configureGuardrailFriction` already. In-process keeps tests that import
  // the module without explicit configuration (memory backend) working.
  store ??= new InProcessGuardrailFrictionStore();
  return store;
}

/** Records `weight` strikes against `scope`. */
export const recordStrike = async (scope: FrictionScope, weight: number): Promise<void> => {
  await ensureStore().recordStrike(scope, weight);
};

/** Returns the current strike total for `scope` (0 on store outage — FAIL-SOFT). */
export const frictionCount = async (scope: FrictionScope): Promise<number> => {
  return await ensureStore().count(scope);
};

/** Arms a cool-down for `scope` (TTL = FRICTION_COOLDOWN_MS). */
export const armCoolDown = async (scope: FrictionScope): Promise<void> => {
  await ensureStore().armCoolDown(scope);
};

/** True while a cool-down is armed for `scope` (false on store outage — FAIL-SOFT). */
export const isCoolingDown = async (scope: FrictionScope): Promise<boolean> => {
  return await ensureStore().isCoolingDown(scope);
};

/** Force-clears a single scope (tests + optional defensive cron). */
export const resetFriction = async (scope: FrictionScope): Promise<void> => {
  await ensureStore().reset(scope);
};

/**
 * Test-only seam: override the internal clock used for cool-down expiry. Pass
 * `undefined` to restore the real clock. Never call from production code.
 */
export const __setNowForTest = (date: Date | undefined): void => {
  nowProvider = date ? () => date : () => new Date();
};

/**
 * Test-only seam: inject a custom store directly (or `null` to force the next
 * call to rebuild from `configureGuardrailFriction` / the in-process default).
 */
export const __setStoreForTest = (next: IGuardrailFrictionStore | null): void => {
  store = next;
};
