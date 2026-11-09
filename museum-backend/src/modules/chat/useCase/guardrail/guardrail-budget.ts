import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import type { CacheService } from '@shared/cache/cache.port';

export interface IGuardrailBudgetStore {
  recordCost(cents: number): Promise<void>;
  cumulativeCents(): Promise<number>;
  reset(): Promise<void>;
}

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
  return Math.max(60, Math.floor((next - date.getTime()) / 1000) + 60);
};

class InProcessGuardrailBudgetStore implements IGuardrailBudgetStore {
  private state: { day: string; cumulativeCents: number } = { day: '', cumulativeCents: 0 };

  private ensureCurrentDay(): void {
    const today = utcDayKey(nowProvider());
    if (this.state.day !== today) {
      this.state = { day: today, cumulativeCents: 0 };
    }
  }

  recordCost(cents: number): Promise<void> {
    if (cents <= 0 || !Number.isFinite(cents)) return Promise.resolve();
    this.ensureCurrentDay();
    this.state.cumulativeCents += cents;

    return Promise.resolve();
  }

  cumulativeCents(): Promise<number> {
    this.ensureCurrentDay();
    return Promise.resolve(this.state.cumulativeCents);
  }

  reset(): Promise<void> {
    this.state = { day: utcDayKey(nowProvider()), cumulativeCents: 0 };

    return Promise.resolve();
  }
}

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
    const reachable = await this.cache.ping().catch(() => false);
    if (!reachable) {
      logger.warn('guardrail_judge_budget_redis_unreachable_fail_closed', {});
      return Number.POSITIVE_INFINITY;
    }

    const value = await this.cache.get<number>(this.keyForToday());
    if (value === null) return 0;
    if (!Number.isFinite(value) || value < 0) {
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

export function configureGuardrailBudget(deps: { cache?: CacheService }): void {
  if (env.guardrails.budgetBackend === 'redis') {
    if (deps.cache === undefined) {
      logger.warn('guardrail_judge_budget_redis_unavailable', {
        detail:
          'GUARDRAIL_BUDGET_BACKEND=redis but no CacheService injected — falling back to in-process counter',
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
  store ??= new InProcessGuardrailBudgetStore();
  return store;
}

export const recordJudgeCost = async (cents: number): Promise<void> => {
  await ensureStore().recordCost(cents);
};

export const getBudgetExhausted = async (): Promise<boolean> => {
  const cap = env.guardrails.budgetCentsPerDay;
  if (cap <= 0) return true;
  const cumulative = await ensureStore().cumulativeCents();
  return cumulative >= cap;
};

export const resetBudget = async (): Promise<void> => {
  await ensureStore().reset();
  logger.info('guardrail_judge_budget_reset', { day: utcDayKey(nowProvider()) });
};

export const __setNowForTest = (date: Date | undefined): void => {
  nowProvider = date ? () => date : () => new Date();
};

export const __setStoreForTest = (next: IGuardrailBudgetStore | null): void => {
  store = next;
};
