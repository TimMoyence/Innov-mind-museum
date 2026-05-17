import { CircuitOpenError } from '@modules/chat/domain/errors/circuit-open.error';
import { logger } from '@shared/logger/logger';

export { CircuitOpenError };

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerOptions {
  failureThreshold?: number;
  windowMs?: number;
  openDurationMs?: number;
}

export class LLMCircuitBreaker {
  private readonly failureThreshold: number;
  private readonly windowMs: number;
  private readonly openDurationMs: number;

  private currentState: CircuitState = 'CLOSED';
  private failures: number[] = [];
  private openedAt: number | null = null;

  constructor(options?: CircuitBreakerOptions) {
    // Env-var overrides let chaos e2e tune short windows (LLM_CB_FAILURE_THRESHOLD=3,
    // LLM_CB_WINDOW_MS=1000, LLM_CB_OPEN_DURATION_MS=500). Prod leaves unset → defaults
    // 5 / 60000 / 30000.
    this.failureThreshold =
      options?.failureThreshold ?? Number(process.env.LLM_CB_FAILURE_THRESHOLD ?? 5);
    this.windowMs = options?.windowMs ?? Number(process.env.LLM_CB_WINDOW_MS ?? 60_000);
    this.openDurationMs =
      options?.openDurationMs ?? Number(process.env.LLM_CB_OPEN_DURATION_MS ?? 30_000);
  }

  /** Transitions OPEN → HALF_OPEN when cooldown expires (side-effecting getter). */
  get state(): CircuitState {
    if (this.currentState === 'OPEN' && this.openedAt !== null) {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed >= this.openDurationMs) {
        this.currentState = 'HALF_OPEN';
        this.openedAt = null;
        logger.info('llm_circuit_breaker_half_open');
      }
    }
    return this.currentState;
  }

  /** Throws CircuitOpenError if OPEN; records success/failure otherwise. */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      throw new CircuitOpenError();
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /** HALF_OPEN → CLOSED on success. */
  recordSuccess(): void {
    if (this.currentState === 'HALF_OPEN') {
      this.currentState = 'CLOSED';
      this.failures = [];
      logger.info('llm_circuit_breaker_closed');
    }
  }

  /** Trips to OPEN if threshold exceeded in the sliding window. */
  recordFailure(): void {
    const now = Date.now();
    this.failures.push(now);
    this.pruneExpiredFailures(now);

    if (this.currentState === 'HALF_OPEN') {
      this.trip(now);
      return;
    }

    if (this.failures.length >= this.failureThreshold) {
      this.trip(now);
    }
  }

  getState(): { state: CircuitState; failureCount: number; lastFailureAt: Date | null } {
    return {
      state: this.state, // triggers OPEN → HALF_OPEN transition if cooldown expired
      failureCount: this.failures.length,
      lastFailureAt:
        this.failures.length > 0 ? new Date(this.failures[this.failures.length - 1]) : null,
    };
  }

  reset(): void {
    this.currentState = 'CLOSED';
    this.failures = [];
    this.openedAt = null;
  }

  private trip(now: number): void {
    this.currentState = 'OPEN';
    this.openedAt = now;
    logger.warn('llm_circuit_breaker_open', {
      failureCount: this.failures.length,
      windowMs: this.windowMs,
    });
  }

  private pruneExpiredFailures(now: number): void {
    const cutoff = now - this.windowMs;
    this.failures = this.failures.filter((ts) => ts > cutoff);
  }
}
