import type { LlmCostCounter } from '@shared/llm-cost-guard/llm-cost-counter.port';

export class InMemoryLlmCostCounter implements LlmCostCounter {
  private readonly totals = new Map<string, number>();

  seed(userId: string, day: string, dollars: number): void {
    this.totals.set(`${userId}:${day}`, dollars);
  }

  async get(userId: string, day: string): Promise<number> {
    return this.totals.get(`${userId}:${day}`) ?? 0;
  }

  async increment(userId: string, day: string, dollars: number): Promise<number> {
    const key = `${userId}:${day}`;
    const next = (this.totals.get(key) ?? 0) + dollars;
    this.totals.set(key, next);
    return next;
  }
}

export class FailingLlmCostCounter implements LlmCostCounter {
  private readonly reason: Error;

  constructor(reason = 'Redis connection refused') {
    this.reason = new Error(reason);
  }

  async get(): Promise<number> {
    throw this.reason;
  }

  async increment(): Promise<number> {
    throw this.reason;
  }
}
