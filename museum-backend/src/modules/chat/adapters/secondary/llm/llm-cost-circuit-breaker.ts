/**
 * Cost-based circuit breaker for LLM API spend (perennial design §11 D9 — RE2, ADR-047).
 *
 * UFR-013 doc-honesty correction — RUN_ID 2026-05-21-p0-c2-cost-breaker.
 * Prior preamble fabricated three assertions: (1) that the primitive was a
 * "phase-2" stub not yet wired in V1, (2) that no production caller invoked
 * `recordCharge()`, (3) that fail-CLOSED was enforced by callers. (1) and (2)
 * were FALSE — `langchain.orchestrator.ts:recordSectionCost()` had been
 * calling `recordCharge()` live since C9.4. (3) was an unfulfilled contract
 * (no caller checked `canAttempt()`). This run wires the missing guards at
 * the orchestrator entry points and rewrites this preamble to reflect the
 * actual call graph. Removal of the verbatim false strings is enforced by
 * `tasks.md` verification grep contract.
 *
 * PR-13 (RUN_ID 2026-05-23-pr-13-threeStateCircuit) refactor — FSM extracted
 * to `@shared/circuit-breaker/three-state-circuit`; cost-specific trip
 * predicate (hourly window OR daily UTC cap) lives in `CostTripStrategy`.
 * Public API (canAttempt, recordCharge, recordFailure, getState, reset,
 * state getter, onStateChange option) preserved byte-identical.
 *
 * Image cost accounting — `estimatePayloadBytes()` in `llm-prompt-builder.ts`
 * substitutes `VISION_BYTES_EQUIVALENT` (`llm-cost-pricing.ts`, default 4000
 * bytes = 1000 vision tokens × 4 bytes/token) for any `image_url` content
 * item, INDEPENDENT of `url` source (base64 data-URL vs https). The literal
 * base64 byte length of an inline image is NOT a realistic input-token proxy
 * (providers bill 85–1105 tokens per image at `detail:high`). Without this
 * override the breaker tripped on the first legitimate single-image request
 * (×100–1000 inflation on data-URL payloads).
 *
 * Distinct from latency `LLMCircuitBreaker`: latency CB trips on failures in
 * window, cost CB trips on spikes (scraping/DDoS amplification) OR daily cap
 * breach. Two conditions ORed: hourly threshold (burst guard) + daily budget
 * (global cap, wider than `guardrail-budget` LLM-judge cap — wraps ANY costed
 * LLM call).
 *
 * Storage in-process (rolling 1h window + UTC daily counter). V1
 * single-instance KISS trade-off — Phase 3 promotes to Redis on horizontal
 * scale.
 */

import { CostTripStrategy } from '@shared/circuit-breaker/strategies/cost-trip-strategy';
import { ThreeStateCircuit, type CircuitState } from '@shared/circuit-breaker/three-state-circuit';
import { logger } from '@shared/logger/logger';

/** Mirrors `GuardrailCircuitBreaker` taxonomy. */
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
  /** Wired by composition root for metrics. */
  onStateChange?: (next: LlmCostCircuitState, prev: LlmCostCircuitState) => void;
  /** Test seam — defaults to `Date.now()`. */
  now?: () => number;
}

const DEFAULT_HOURLY_THRESHOLD_CENTS = 5_000; // $50/h spike alarm
const DEFAULT_DAILY_BUDGET_CENTS = 50_000; // $500/day hard cap
const DEFAULT_OPEN_DURATION_MS = 300_000; // 5 min cooldown

/**
 * CLOSED → OPEN on cost anomaly or daily cap breach. OPEN → HALF_OPEN after cooldown.
 * HALF_OPEN admits ONE probe; failure returns to OPEN, success returns to CLOSED.
 */
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

  /** Transitions OPEN → HALF_OPEN lazily once cooldown elapses. Cheap, no I/O. */
  get state(): LlmCostCircuitState {
    return this.circuit.state;
  }

  /**
   * CLOSED → always true. OPEN → false. HALF_OPEN → true ONLY for the first caller
   * (single probe slot, race-safe via sync mutation).
   */
  canAttempt(): boolean {
    return this.circuit.canAttempt();
  }

  /** Recovers HALF_OPEN → CLOSED. Pure cost accumulation otherwise. */
  recordCharge(cents: number): void {
    if (!Number.isFinite(cents) || cents <= 0) return;
    const stateBefore = this.circuit.state; // triggers lazy OPEN → HALF_OPEN
    this.strategy.recordCharge(cents);

    // Trip BEFORE HALF_OPEN recovery so cap breaches are honoured on the probe call.
    if (this.strategy.shouldTrip(this.nowFn())) {
      this.circuit.trip(stateBefore);
      return;
    }

    if (stateBefore === 'HALF_OPEN') {
      this.circuit.recordOutcome('success');
    }
  }

  /** Probe attempt consumed (no cost charged). HALF_OPEN → re-trips OPEN. */
  recordFailure(): void {
    if (this.circuit.state === 'HALF_OPEN') {
      this.circuit.recordOutcome('failure');
    }
  }

  getState(): LlmCostCircuitBreakerSnapshot {
    const now = this.nowFn();
    const state = this.circuit.state; // triggers lazy OPEN → HALF_OPEN if cooldown elapsed
    return {
      state,
      hourlySpendCents: this.strategy.getHourlySpendCents(now),
      dailySpendCents: this.strategy.getDailySpendCents(now),
      lastTripAt: this.circuit.lastTripAt !== null ? new Date(this.circuit.lastTripAt) : null,
      openedAt: this.circuit.openedAt !== null ? new Date(this.circuit.openedAt) : null,
    };
  }

  /** Test-only. */
  reset(): void {
    this.circuit.reset();
  }
}
