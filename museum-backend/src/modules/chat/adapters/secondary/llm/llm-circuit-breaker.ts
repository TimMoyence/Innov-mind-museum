import { CircuitOpenError } from '@modules/chat/domain/errors/circuit-open.error';
import { SlidingWindowFailureStrategy } from '@shared/circuit-breaker/strategies/sliding-window-failure-strategy';
import { ThreeStateCircuit, type CircuitState } from '@shared/circuit-breaker/three-state-circuit';
import { logger } from '@shared/logger/logger';

export { CircuitOpenError };

interface CircuitBreakerOptions {
  failureThreshold?: number;
  windowMs?: number;
  openDurationMs?: number;
  onStateChange?: (next: CircuitState, prev: CircuitState) => void;
  now?: () => number;
}

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_OPEN_DURATION_MS = 30_000;

export class LLMCircuitBreaker {
  private readonly windowMs: number;
  private readonly strategy: SlidingWindowFailureStrategy;
  private readonly circuit: ThreeStateCircuit<SlidingWindowFailureStrategy>;

  constructor(options?: CircuitBreakerOptions) {
    const failureThreshold =
      options?.failureThreshold ??
      Number(process.env.LLM_CB_FAILURE_THRESHOLD ?? DEFAULT_FAILURE_THRESHOLD);
    this.windowMs = options?.windowMs ?? Number(process.env.LLM_CB_WINDOW_MS ?? DEFAULT_WINDOW_MS);
    const openDurationMs =
      options?.openDurationMs ??
      Number(process.env.LLM_CB_OPEN_DURATION_MS ?? DEFAULT_OPEN_DURATION_MS);
    const now = options?.now ?? Date.now;
    const userOnStateChange = options?.onStateChange;

    this.strategy = new SlidingWindowFailureStrategy({
      threshold: failureThreshold,
      windowMs: this.windowMs,
      now,
    });
    this.circuit = new ThreeStateCircuit({
      strategy: this.strategy,
      openDurationMs,
      now,
      onStateChange: (next, prev) => {
        if (next === 'HALF_OPEN') {
          logger.info('llm_circuit_breaker_half_open');
        } else if (next === 'CLOSED' && prev === 'HALF_OPEN') {
          logger.info('llm_circuit_breaker_closed');
        } else if (next === 'OPEN') {
          logger.warn('llm_circuit_breaker_open', {
            failureCount: this.strategy.getFailureCount(),
            windowMs: this.windowMs,
          });
        }
        userOnStateChange?.(next, prev);
      },
    });
  }

  get state(): CircuitState {
    return this.circuit.state;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.circuit.state === 'OPEN') {
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

  recordSuccess(): void {
    this.circuit.recordOutcome('success');
  }

  recordFailure(): void {
    this.strategy.recordFailure();
    this.circuit.recordOutcome('failure');
  }

  getState(): { state: CircuitState; failureCount: number; lastFailureAt: Date | null } {
    const last = this.strategy.getLastFailureAt();
    return {
      state: this.circuit.state,
      failureCount: this.strategy.getFailureCount(),
      lastFailureAt: last !== null ? new Date(last) : null,
    };
  }

  reset(): void {
    this.circuit.reset();
  }
}
