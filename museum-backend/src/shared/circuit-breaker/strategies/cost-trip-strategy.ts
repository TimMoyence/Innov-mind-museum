/**
 * Cost-based trip predicate for LLM API spend. Dual condition: hourly spike
 * (sliding 1h window) OR daily UTC budget breach. Used by `LlmCostCircuitBreaker`.
 *
 * Pure data — no logging, no I/O. `now()` injection for deterministic tests.
 *
 * Design references:
 *   - design.md §4.2
 */

import type { CircuitTripStrategy } from '@shared/circuit-breaker/three-state-circuit';

export interface CostTripStrategyOptions {
  hourlyThresholdCents: number;
  dailyBudgetCents: number;
  now?: () => number;
}

interface CostEntry {
  at: number;
  /** Cents — guaranteed positive (negatives rejected by `recordCharge`). */
  cents: number;
}

const HOUR_MS = 60 * 60 * 1000;

const utcDayKey = (epochMs: number): string => new Date(epochMs).toISOString().slice(0, 10);

export class CostTripStrategy implements CircuitTripStrategy {
  private hourlyWindow: CostEntry[] = [];
  private dailySpend = { day: '', cents: 0 };
  private readonly hourlyThresholdCents: number;
  private readonly dailyBudgetCents: number;
  private readonly nowFn: () => number;

  constructor(options: CostTripStrategyOptions) {
    this.hourlyThresholdCents = options.hourlyThresholdCents;
    this.dailyBudgetCents = options.dailyBudgetCents;
    this.nowFn = options.now ?? Date.now;
  }

  recordCharge(cents: number): void {
    if (!Number.isFinite(cents) || cents <= 0) return;
    const t = this.nowFn();
    this.pruneExpired(t);
    this.hourlyWindow.push({ at: t, cents });
    this.accumulateDaily(t, cents);
  }

  shouldTrip(now: number): boolean {
    this.pruneExpired(now);
    return (
      this.computeHourlySpend() > this.hourlyThresholdCents ||
      this.currentDailySpend(now) > this.dailyBudgetCents
    );
  }

  pruneExpired(now: number): void {
    const cutoff = now - HOUR_MS;
    this.hourlyWindow = this.hourlyWindow.filter((e) => e.at > cutoff);
  }

  reset(): void {
    this.hourlyWindow = [];
    this.dailySpend = { day: '', cents: 0 };
  }

  getHourlySpendCents(now: number): number {
    this.pruneExpired(now);
    return this.computeHourlySpend();
  }

  getDailySpendCents(now: number): number {
    return this.currentDailySpend(now);
  }

  private computeHourlySpend(): number {
    return this.hourlyWindow.reduce((acc, e) => acc + e.cents, 0);
  }

  private currentDailySpend(now: number): number {
    const day = utcDayKey(now);
    return this.dailySpend.day === day ? this.dailySpend.cents : 0;
  }

  private accumulateDaily(now: number, cents: number): void {
    const day = utcDayKey(now);
    if (this.dailySpend.day !== day) {
      this.dailySpend = { day, cents: 0 };
    }
    this.dailySpend.cents += cents;
  }
}
