import { CostTripStrategy } from '@shared/circuit-breaker/strategies/cost-trip-strategy';
import { ThreeStateCircuit, type CircuitState } from '@shared/circuit-breaker/three-state-circuit';
import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';

export type LlmCostCircuitState = CircuitState;

export interface LlmCostCircuitBreakerSnapshot {
  state: LlmCostCircuitState;
  hourlySpendCents: number;
  dailySpendCents: number;
  lastTripAt: Date | null;
  openedAt: Date | null;
}

export interface LlmCostCircuitBreakerOptions {
  hourlyThresholdCents?: number;
  dailyBudgetCents?: number;
  openDurationMs?: number;
  onStateChange?: (next: LlmCostCircuitState, prev: LlmCostCircuitState) => void;
  now?: () => number;
}

const DEFAULT_HOURLY_THRESHOLD_CENTS = 5_000;
const DEFAULT_DAILY_BUDGET_CENTS = 50_000;
const DEFAULT_OPEN_DURATION_MS = 300_000;

export class LlmCostCircuitBreaker {
  private readonly hourlyThresholdCents: number;
  private readonly dailyBudgetCents: number;
  private readonly nowFn: () => number;
  private readonly strategy: CostTripStrategy;
  private readonly circuit: ThreeStateCircuit<CostTripStrategy>;

  constructor(options: LlmCostCircuitBreakerOptions = {}) {
    this.hourlyThresholdCents = options.hourlyThresholdCents ?? DEFAULT_HOURLY_THRESHOLD_CENTS;
    this.dailyBudgetCents = options.dailyBudgetCents ?? DEFAULT_DAILY_BUDGET_CENTS;
    const openDurationMs = options.openDurationMs ?? DEFAULT_OPEN_DURATION_MS;
    this.nowFn = options.now ?? Date.now;
    const userOnStateChange = options.onStateChange;

    this.strategy = new CostTripStrategy({
      hourlyThresholdCents: this.hourlyThresholdCents,
      dailyBudgetCents: this.dailyBudgetCents,
      now: this.nowFn,
    });
    this.circuit = new ThreeStateCircuit({
      strategy: this.strategy,
      openDurationMs,
      now: this.nowFn,
      onStateChange: (next, prev) => {
        if (next === 'HALF_OPEN') {
          logger.info('llm_cost_circuit_breaker_half_open', {
            hourlySpendCents: this.strategy.getHourlySpendCents(this.nowFn()),
            dailySpendCents: this.strategy.getDailySpendCents(this.nowFn()),
          });
        } else if (next === 'CLOSED' && prev === 'HALF_OPEN') {
          logger.info('llm_cost_circuit_breaker_close', {
            hourlySpendCents: this.strategy.getHourlySpendCents(this.nowFn()),
            dailySpendCents: this.strategy.getDailySpendCents(this.nowFn()),
          });
        } else if (next === 'OPEN') {
          logger.warn('llm_cost_circuit_breaker_open', {
            hourlySpendCents: this.strategy.getHourlySpendCents(this.nowFn()),
            dailySpendCents: this.strategy.getDailySpendCents(this.nowFn()),
            hourlyThresholdCents: this.hourlyThresholdCents,
            dailyBudgetCents: this.dailyBudgetCents,
            from: prev === 'HALF_OPEN' ? 'half_open' : 'closed',
          });
        }
        userOnStateChange?.(next, prev);
      },
    });
  }

  get state(): LlmCostCircuitState {
    return this.circuit.state;
  }

  canAttempt(): boolean {
    return this.circuit.canAttempt();
  }

  recordCharge(cents: number): void {
    if (!Number.isFinite(cents) || cents <= 0) return;
    const stateBefore = this.circuit.state;

    if (stateBefore === 'HALF_OPEN') {
      const now = this.nowFn();
      const wouldBreach =
        this.strategy.getHourlySpendCents(now) + cents > this.hourlyThresholdCents ||
        this.strategy.getDailySpendCents(now) + cents > this.dailyBudgetCents;

      if (wouldBreach) {
        this.strategy.recordCharge(cents);
        this.circuit.trip('HALF_OPEN');
        return;
      }

      this.circuit.recordOutcome('success');
      this.strategy.recordCharge(cents);
      return;
    }

    this.strategy.recordCharge(cents);
    if (this.strategy.shouldTrip(this.nowFn())) {
      this.circuit.trip(stateBefore);
    }
  }

  recordFailure(): void {
    if (this.circuit.state === 'HALF_OPEN') {
      this.circuit.recordOutcome('failure');
    }
  }

  getState(): LlmCostCircuitBreakerSnapshot {
    const now = this.nowFn();
    const state = this.circuit.state;
    return {
      state,
      hourlySpendCents: this.strategy.getHourlySpendCents(now),
      dailySpendCents: this.strategy.getDailySpendCents(now),
      lastTripAt: this.circuit.lastTripAt !== null ? new Date(this.circuit.lastTripAt) : null,
      openedAt: this.circuit.openedAt !== null ? new Date(this.circuit.openedAt) : null,
    };
  }

  reset(): void {
    this.circuit.reset();
  }
}

export const chargeFailOpen = (
  breaker: LlmCostCircuitBreaker | null,
  estimateCents: () => number,
  failureEvent: string,
  context: Record<string, unknown> = {},
): void => {
  if (!breaker) return;
  try {
    breaker.recordCharge(estimateCents());
  } catch (err) {
    logger.warn(failureEvent, { ...context, err: errorMessage(err) });
  }
};
