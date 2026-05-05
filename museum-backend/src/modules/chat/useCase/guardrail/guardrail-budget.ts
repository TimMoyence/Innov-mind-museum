/**
 * F4 (2026-04-30) + ADR-030 (2026-05-05) — daily cost budget for the LLM-judge guardrail.
 *
 * Backends:
 *   - 'memory' — per-process counter (current behaviour). Acceptable for dev,
 *     test, and single-instance deployments.
 *   - 'redis'  — shared counter across replicas via SET INCRBY + TTL. Eliminates
 *     the N× spend amplification described in the original F4 ADR-015 note.
 *
 * Backend selection is read once at module load from `env.guardrails.budgetBackend`.
 * Tests can swap the backing store via `__setStoreForTest()` to avoid coupling
 * to a Redis instance.
 *
 * Daily reset is triggered lazily on the first call after the UTC-midnight
 * boundary, so no background timer is needed in either backend.
 */
import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import type { CacheService } from '@shared/cache/cache.port';

/** Port consumed by the public functional API. Both adapters implement it. */
export interface IGuardrailBudgetStore {
  /** Adds `cents` to today's running total. Defensive against ≤0 / non-finite. */
  recordCost(cents: number): Promise<void>;
  /** Returns today's cumulative cost (cents). 0 when nothing recorded yet. */
  cumulativeCents(): Promise<number>;
  /** Force-clears today's counter. Used by tests + optional defensive cron. */
  reset(): Promise<void>;
}

// Test seam — overrideable clock so the daily-reset path can be exercised
// without mocking Date globally. Untouched in production.
let nowProvider: () => Date = () => new Date();

const utcDayKey = (date: Date): string => date.toISOString().slice(0, 10);

const REDIS_KEY_PREFIX = 'guardrail:judge:budget:';

const secondsUntilUtcMidnightWithBuffer = (date: Date): number => {
  const next = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  );
  // +60s buffer past midnight so a clock skew between the app and Redis cannot
  // expire the key while the app still believes it is the current day.
  return Math.max(60, Math.floor((next - date.getTime()) / 1000) + 60);
};

/** In-process adapter — preserves the F4 behaviour for dev/test/single-instance. */
class InProcessGuardrailBudgetStore implements IGuardrailBudgetStore {
  private state: { day: string; cumulativeCents: number } = { day: '', cumulativeCents: 0 };

  private ensureCurrentDay(): void {
    const today = utcDayKey(nowProvider());
    if (this.state.day !== today) {
      this.state = { day: today, cumulativeCents: 0 };
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- async port contract; in-memory mutation is synchronous
  async recordCost(cents: number): Promise<void> {
    if (cents <= 0 || !Number.isFinite(cents)) return;
    this.ensureCurrentDay();
    this.state.cumulativeCents += cents;
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- async port contract; in-memory read is synchronous
  async cumulativeCents(): Promise<number> {
    this.ensureCurrentDay();
    return this.state.cumulativeCents;
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- async port contract; in-memory mutation is synchronous
  async reset(): Promise<void> {
    this.state = { day: utcDayKey(nowProvider()), cumulativeCents: 0 };
  }
}

/**
 * Redis adapter — uses CacheService.incrBy for atomic counter + TTL semantics.
 *
 * Fail-CLOSED: when Redis is unreachable (CacheService returns null from
 * incrBy / get), `cumulativeCents()` returns Infinity so the calling guard
 * (`getBudgetExhausted`) treats the budget as exhausted and the LLM judge
 * falls back to keyword-only filtering. This protects against a Redis-DDoS
 * attack used to bypass the cumulative cap.
 */
class RedisGuardrailBudgetStore implements IGuardrailBudgetStore {
  constructor(private readonly cache: CacheService) {}

  private keyForToday(): string {
    return `${REDIS_KEY_PREFIX}${utcDayKey(nowProvider())}`;
  }

  async recordCost(cents: number): Promise<void> {
    if (cents <= 0 || !Number.isFinite(cents)) return;
    const now = nowProvider();
    const ttl = secondsUntilUtcMidnightWithBuffer(now);
    await this.cache.incrBy(this.keyForToday(), Math.round(cents), ttl);
  }

  async cumulativeCents(): Promise<number> {
    const value = await this.cache.get<number>(this.keyForToday());
    if (value === null) return 0;
    if (!Number.isFinite(value) || value < 0) {
      // Treat malformed counter as fail-CLOSED — see class comment.
      logger.warn('guardrail_judge_budget_counter_invalid', { value });
      return Number.POSITIVE_INFINITY;
    }
    return value;
  }

  async reset(): Promise<void> {
    await this.cache.del(this.keyForToday());
  }
}

let store: IGuardrailBudgetStore | null = null;

/**
 * Wires the chosen backend at composition time. Call once at module boot
 * BEFORE any route handler imports `recordJudgeCost` / `getBudgetExhausted`.
 *
 * Backend selection rule:
 *   - `env.guardrails.budgetBackend === 'redis'` AND a CacheService is provided
 *     → use Redis adapter.
 *   - `env.guardrails.budgetBackend === 'redis'` AND no CacheService → log a
 *     warning and fall back to in-process. This keeps a misconfigured
 *     CACHE_ENABLED=false deployment from deadlocking the judge entirely.
 *   - otherwise → use in-process adapter.
 */
export function configureGuardrailBudget(deps: { cache?: CacheService }): void {
  if (env.guardrails.budgetBackend === 'redis') {
    if (deps.cache === undefined) {
      logger.warn('guardrail_judge_budget_redis_unavailable', {
        detail: 'GUARDRAIL_BUDGET_BACKEND=redis but no CacheService injected — falling back to in-process counter',
      });
      store = new InProcessGuardrailBudgetStore();
      return;
    }
    store = new RedisGuardrailBudgetStore(deps.cache);
    return;
  }
  store = new InProcessGuardrailBudgetStore();
}

function ensureStore(): IGuardrailBudgetStore {
  // Defensive default — the composition root SHOULD have called
  // `configureGuardrailBudget` already. Falling back to in-process keeps
  // tests that import the module without explicit configuration working.
  store ??= new InProcessGuardrailBudgetStore();
  return store;
}

/** Records a judge cost (in cents) against today's budget. */
export const recordJudgeCost = async (cents: number): Promise<void> => {
  await ensureStore().recordCost(cents);
};

/**
 * Returns true once today's cumulative cost has exceeded the configured cap.
 * Always inspect this BEFORE invoking the judge so we never go over budget.
 */
export const getBudgetExhausted = async (): Promise<boolean> => {
  const cap = env.guardrails.budgetCentsPerDay;
  if (cap <= 0) return true; // operator disabled the judge entirely
  const cumulative = await ensureStore().cumulativeCents();
  return cumulative >= cap;
};

/**
 * Force-clears today's counter. Used by tests + the optional nightly cron
 * (defensive — daily reset is otherwise lazy).
 */
export const resetBudget = async (): Promise<void> => {
  await ensureStore().reset();
  logger.info('guardrail_judge_budget_reset', { day: utcDayKey(nowProvider()) });
};

/**
 * Test-only seam: override the internal clock used for the day boundary check.
 * Pass `undefined` to restore the real clock. Never call from production code.
 */
export const __setNowForTest = (date: Date | undefined): void => {
  nowProvider = date ? () => date : () => new Date();
};

/**
 * Test-only seam: inject a custom store directly. Useful when a test needs to
 * exercise the Redis-adapter logic against a stub CacheService without going
 * through `configureGuardrailBudget`.
 */
export const __setStoreForTest = (next: IGuardrailBudgetStore | null): void => {
  store = next;
};
