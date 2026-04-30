import { AppError } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';

/**
 * Thrown when the circuit breaker is in OPEN state and LLM calls are blocked.
 * Extends `AppError` so the global error middleware emits a 503 response
 * uniformly across degraded-dependency paths.
 */
export class CircuitOpenError extends AppError {
  constructor() {
    super({
      message: 'Circuit breaker is OPEN — LLM calls are temporarily blocked',
      statusCode: 503,
      code: 'CIRCUIT_BREAKER_OPEN',
    });
    this.name = 'CircuitOpenError';
  }
}

/**
 *
 */
type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerOptions {
  failureThreshold?: number;
  windowMs?: number;
  openDurationMs?: number;
}

/** Three-state circuit breaker (CLOSED → OPEN → HALF_OPEN) for LLM API resilience. */
export class LLMCircuitBreaker {
  private readonly failureThreshold: number;
  private readonly windowMs: number;
  private readonly openDurationMs: number;

  private currentState: CircuitState = 'CLOSED';
  private failures: number[] = [];
  private openedAt: number | null = null;

  constructor(options?: CircuitBreakerOptions) {
    this.failureThreshold = options?.failureThreshold ?? 5;
    this.windowMs = options?.windowMs ?? 60_000;
    this.openDurationMs = options?.openDurationMs ?? 30_000;
  }

  /** Returns current state, transitioning from OPEN to HALF_OPEN when the cooldown expires. */
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

  /** Wraps an async call: throws CircuitOpenError if OPEN, records success/failure otherwise. */
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

  /** Records a successful call; transitions HALF_OPEN → CLOSED. */
  recordSuccess(): void {
    if (this.currentState === 'HALF_OPEN') {
      this.currentState = 'CLOSED';
      this.failures = [];
      logger.info('llm_circuit_breaker_closed');
    }
  }

  /** Records a failure; trips to OPEN if threshold exceeded in the sliding window. */
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

  /** Returns a snapshot of the breaker's internal state for observability. */
  getState(): { state: CircuitState; failureCount: number; lastFailureAt: Date | null } {
    return {
      state: this.state, // triggers OPEN → HALF_OPEN transition if cooldown expired
      failureCount: this.failures.length,
      lastFailureAt:
        this.failures.length > 0 ? new Date(this.failures[this.failures.length - 1]) : null,
    };
  }

  /** Resets the breaker to CLOSED with no recorded failures. */
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
