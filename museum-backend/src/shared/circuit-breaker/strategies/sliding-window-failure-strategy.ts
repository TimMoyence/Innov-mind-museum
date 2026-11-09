import type { CircuitTripStrategy } from '@shared/circuit-breaker/three-state-circuit';

export interface SlidingWindowFailureStrategyOptions {
  threshold: number;
  windowMs: number;
  now?: () => number;
}

export class SlidingWindowFailureStrategy implements CircuitTripStrategy {
  private failures: number[] = [];
  private readonly threshold: number;
  private readonly windowMs: number;
  private readonly nowFn: () => number;

  constructor(options: SlidingWindowFailureStrategyOptions) {
    this.threshold = options.threshold;
    this.windowMs = options.windowMs;
    this.nowFn = options.now ?? Date.now;
  }

  recordFailure(): void {
    const t = this.nowFn();
    this.pruneExpired(t);
    this.failures.push(t);
  }

  shouldTrip(now: number): boolean {
    this.pruneExpired(now);
    return this.failures.length >= this.threshold;
  }

  pruneExpired(now: number): void {
    const cutoff = now - this.windowMs;
    this.failures = this.failures.filter((ts) => ts > cutoff);
  }

  reset(): void {
    this.failures = [];
  }

  resetTransient(): void {
    this.failures = [];
  }

  getFailureCount(): number {
    return this.failures.length;
  }

  getLastFailureAt(): number | null {
    if (this.failures.length === 0) return null;
    return this.failures[this.failures.length - 1] ?? null;
  }
}
