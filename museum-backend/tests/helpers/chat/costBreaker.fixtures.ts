/**
 * Shared test fixture for `LlmCostCircuitBreaker` mocks.
 *
 * RUN_ID 2026-05-21-p0-c2-cost-breaker — C2 cost breaker remediation.
 * Spec §3 R1/R3/R9 + design.md §D5 (test fixture co-location).
 *
 * Returns a `Partial<LlmCostCircuitBreaker>` typed cast via `as LlmCostCircuitBreaker`
 * (allowed in `tests/helpers/` per spec §4 / CLAUDE.md test discipline). All
 * defaults model a CLOSED, healthy breaker so individual tests can override
 * only what they exercise. Jest spies are injected by passing `jest.fn()`
 * implementations through `overrides`.
 */

import type {
  LlmCostCircuitBreaker,
  LlmCostCircuitBreakerSnapshot,
  LlmCostCircuitState,
} from '@modules/chat/adapters/secondary/llm/llm-cost-circuit-breaker';

export interface CostBreakerOverrides {
  /** When provided, the `state` getter + `getState()` snapshot return this state. */
  state?: LlmCostCircuitState;
  canAttempt?: () => boolean;
  recordCharge?: (cents: number) => void;
  recordFailure?: () => void;
  /** Full override of the `getState()` snapshot. Wins over `state` if both passed. */
  getState?: () => LlmCostCircuitBreakerSnapshot;
}

const DEFAULT_SNAPSHOT: LlmCostCircuitBreakerSnapshot = {
  state: 'CLOSED',
  hourlySpendCents: 0,
  dailySpendCents: 0,
  lastTripAt: null,
  openedAt: null,
};

/**
 * Build a `Partial<LlmCostCircuitBreaker>` test double. Defaults model a
 * healthy CLOSED breaker (`canAttempt → true`, noop record methods, CLOSED
 * snapshot). Pass an override map to swap behaviours; pass `jest.fn()` instances
 * to assert call-order / call-args.
 */
export function makeCostBreaker(overrides: CostBreakerOverrides = {}): LlmCostCircuitBreaker {
  const baseSnapshot: LlmCostCircuitBreakerSnapshot = overrides.state
    ? { ...DEFAULT_SNAPSHOT, state: overrides.state }
    : DEFAULT_SNAPSHOT;

  const breaker: Partial<LlmCostCircuitBreaker> = {
    // `state` is a getter on the real class; we expose it as a plain value.
    // TS treats the property assignment as compatible with the getter return type.
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

/**
 * Convenience: build a breaker reporting OPEN. `canAttempt()` returns false,
 * `state` getter returns 'OPEN', `getState()` snapshot reflects it. Used by
 * R1/R3 tests to drive the fail-CLOSED path under test.
 */
export function makeOpenCostBreaker(
  overrides: Omit<CostBreakerOverrides, 'state' | 'canAttempt'> = {},
): LlmCostCircuitBreaker {
  return makeCostBreaker({
    state: 'OPEN',
    canAttempt: () => false,
    ...overrides,
  });
}

/**
 * Convenience: build a breaker reporting HALF_OPEN with the probe slot
 * available. `canAttempt()` returns true on the FIRST call (mirrors the real
 * primitive's single-probe semantics — caller MUST install a stateful
 * override if they want to exercise concurrent probes). Used by R9 tests
 * to verify `recordFailure()` is called when the probe throws.
 */
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
