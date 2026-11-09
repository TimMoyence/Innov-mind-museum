import type {
  LlmCostCircuitBreaker,
  LlmCostCircuitBreakerSnapshot,
  LlmCostCircuitState,
} from '@modules/chat/adapters/secondary/llm/llm-cost-circuit-breaker';

export interface CostBreakerOverrides {
  state?: LlmCostCircuitState;
  canAttempt?: () => boolean;
  recordCharge?: (cents: number) => void;
  recordFailure?: () => void;
  getState?: () => LlmCostCircuitBreakerSnapshot;
}

const DEFAULT_SNAPSHOT: LlmCostCircuitBreakerSnapshot = {
  state: 'CLOSED',
  hourlySpendCents: 0,
  dailySpendCents: 0,
  lastTripAt: null,
  openedAt: null,
};

export function makeCostBreaker(overrides: CostBreakerOverrides = {}): LlmCostCircuitBreaker {
  const baseSnapshot: LlmCostCircuitBreakerSnapshot = overrides.state
    ? { ...DEFAULT_SNAPSHOT, state: overrides.state }
    : DEFAULT_SNAPSHOT;

  const breaker: Partial<LlmCostCircuitBreaker> = {
    get state(): LlmCostCircuitState {
      return overrides.state ?? 'CLOSED';
    },
    canAttempt: overrides.canAttempt ?? (() => true),
    recordCharge: overrides.recordCharge ?? (() => undefined),
    recordFailure: overrides.recordFailure ?? (() => undefined),
    getState: overrides.getState ?? (() => baseSnapshot),
  };

  return breaker as LlmCostCircuitBreaker;
}

export function makeOpenCostBreaker(
  overrides: Omit<CostBreakerOverrides, 'state' | 'canAttempt'> = {},
): LlmCostCircuitBreaker {
  return makeCostBreaker({
    state: 'OPEN',
    canAttempt: () => false,
    ...overrides,
  });
}

export function makeHalfOpenCostBreaker(
  overrides: Omit<CostBreakerOverrides, 'state'> = {},
): LlmCostCircuitBreaker {
  let probeTaken = false;
  return makeCostBreaker({
    state: 'HALF_OPEN',
    canAttempt:
      overrides.canAttempt ??
      (() => {
        if (probeTaken) return false;
        probeTaken = true;
        return true;
      }),
    ...overrides,
  });
}
