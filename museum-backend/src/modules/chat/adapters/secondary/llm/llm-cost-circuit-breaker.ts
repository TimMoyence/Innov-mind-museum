/**
 * Cost-based circuit breaker for LLM API spend (perennial design §11 D9 — RE2, ADR-047).
 *
 * STATUS — PHASE 2 PRIMITIVE, NOT WIRED IN V1 HOT PATH. Primitive shipped + unit-tested,
 * singleton in composition root for `onStateChange` Prometheus wiring. **No production
 * caller invokes `recordCharge()` yet.** Phase 2 (B2B onset, per-tenant cost attribution)
 * wires it around the LLM orchestrator call site.
 *
 * Distinct from latency `LLMCircuitBreaker`: latency CB trips on failures in window,
 * cost CB trips on spikes (scraping/DDoS amplification) OR daily cap breach. Two
 * conditions ORed: hourly threshold (burst guard) + daily budget (global cap, wider
 * than `guardrail-budget` LLM-judge cap — wraps ANY costed LLM call).
 *
 * Storage in-process (rolling 1h window + UTC daily counter). V1 single-instance KISS
 * trade-off — Phase 3 promotes to Redis on horizontal scale.
 *
 * Fail-CLOSED: when OPEN, callers MUST short-circuit with 503-equivalent. NEVER
 * fail-open — cost protection is a safety guarantee, not a soft hint.
 */

import { logger } from '@shared/logger/logger';

/** Mirrors `GuardrailCircuitBreaker` taxonomy. */
export type LlmCostCircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

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
const HOUR_MS = 3_600_000;

interface CostEntry {
  at: number;
  /** Cents — guaranteed positive (negatives rejected by `record`). */
  cents: number;
}

const utcDayKey = (epochMs: number): string => new Date(epochMs).toISOString().slice(0, 10);

/**
 * CLOSED → OPEN on cost anomaly or daily cap breach. OPEN → HALF_OPEN after cooldown.
 * HALF_OPEN admits ONE probe; failure returns to OPEN, success returns to CLOSED.
 */
export class LlmCostCircuitBreaker {
  private readonly hourlyThresholdCents: number;
  private readonly dailyBudgetCents: number;
  private readonly openDurationMs: number;
  private readonly onStateChange?: (next: LlmCostCircuitState, prev: LlmCostCircuitState) => void;
  private readonly now: () => number;

  private currentState: LlmCostCircuitState = 'CLOSED';
  private openedAt: number | null = null;
  private lastTripAt: number | null = null;
  /** Pruned lazily on each access. */
  private hourlyCharges: CostEntry[] = [];
  /** Resets when UTC day changes. */
  private dailySpend = { day: '', cents: 0 };
  /** Ensures only ONE probe at a time when HALF_OPEN. */
  private probeInFlight = false;

  constructor(options: LlmCostCircuitBreakerOptions = {}) {
    this.hourlyThresholdCents = options.hourlyThresholdCents ?? DEFAULT_HOURLY_THRESHOLD_CENTS;
    this.dailyBudgetCents = options.dailyBudgetCents ?? DEFAULT_DAILY_BUDGET_CENTS;
    this.openDurationMs = options.openDurationMs ?? DEFAULT_OPEN_DURATION_MS;
    this.onStateChange = options.onStateChange;
    this.now = options.now ?? Date.now;
  }

  /** Transitions OPEN → HALF_OPEN lazily once cooldown elapses. Cheap, no I/O. */
  get state(): LlmCostCircuitState {
    if (this.currentState === 'OPEN' && this.openedAt !== null) {
      const elapsed = this.now() - this.openedAt;
      if (elapsed >= this.openDurationMs) {
        this.transitionTo('HALF_OPEN');
        this.openedAt = null;
        this.probeInFlight = false;
        logger.info('llm_cost_circuit_breaker_half_open', {
          hourlySpendCents: this.computeHourlySpend(),
          dailySpendCents: this.currentDailySpend(),
        });
      }
    }
    return this.currentState;
  }

  /**
   * CLOSED → always true. OPEN → false. HALF_OPEN → true ONLY for the first caller
   * (single probe slot, race-safe via sync mutation).
   */
  canAttempt(): boolean {
    const state = this.state;
    if (state === 'CLOSED') return true;
    if (state === 'OPEN') return false;
    if (this.probeInFlight) return false;
    this.probeInFlight = true;
    return true;
  }

  /** Recovers HALF_OPEN → CLOSED. Pure cost accumulation otherwise. */
  recordCharge(cents: number): void {
    if (!Number.isFinite(cents) || cents <= 0) return;
    const now = this.now();
    this.appendCharge(now, cents);

    // Trip BEFORE HALF_OPEN recovery so cap breaches are honoured on the probe call.
    if (this.shouldTrip()) {
      this.trip(now, 'CLOSED');
      return;
    }

    if (this.currentState === 'HALF_OPEN') {
      this.transitionTo('CLOSED');
      this.probeInFlight = false;
      logger.info('llm_cost_circuit_breaker_close', {
        hourlySpendCents: this.computeHourlySpend(),
        dailySpendCents: this.currentDailySpend(),
      });
    }
  }

  /** Probe attempt consumed (no cost charged). HALF_OPEN → re-trips OPEN. */
  recordFailure(): void {
    if (this.currentState === 'HALF_OPEN') {
      this.trip(this.now(), 'HALF_OPEN');
    }
  }

  getState(): LlmCostCircuitBreakerSnapshot {
    return {
      state: this.state, // triggers lazy OPEN → HALF_OPEN if cooldown elapsed
      hourlySpendCents: this.computeHourlySpend(),
      dailySpendCents: this.currentDailySpend(),
      lastTripAt: this.lastTripAt !== null ? new Date(this.lastTripAt) : null,
      openedAt: this.openedAt !== null ? new Date(this.openedAt) : null,
    };
  }

  /** Test-only. */
  reset(): void {
    const prev = this.currentState;
    this.currentState = 'CLOSED';
    this.openedAt = null;
    this.lastTripAt = null;
    this.hourlyCharges = [];
    this.dailySpend = { day: '', cents: 0 };
    this.probeInFlight = false;
    if (prev !== 'CLOSED') {
      this.onStateChange?.('CLOSED', prev);
    }
  }

  private appendCharge(now: number, cents: number): void {
    this.hourlyCharges.push({ at: now, cents });
    this.pruneExpiredCharges(now);
    this.accumulateDaily(now, cents);
  }

  private pruneExpiredCharges(now: number): void {
    const cutoff = now - HOUR_MS;
    this.hourlyCharges = this.hourlyCharges.filter((e) => e.at > cutoff);
  }

  private accumulateDaily(now: number, cents: number): void {
    const day = utcDayKey(now);
    if (this.dailySpend.day !== day) {
      this.dailySpend = { day, cents: 0 };
    }
    this.dailySpend.cents += cents;
  }

  private computeHourlySpend(): number {
    this.pruneExpiredCharges(this.now());
    return this.hourlyCharges.reduce((acc, e) => acc + e.cents, 0);
  }

  private currentDailySpend(): number {
    const day = utcDayKey(this.now());
    return this.dailySpend.day === day ? this.dailySpend.cents : 0;
  }

  private shouldTrip(): boolean {
    return (
      this.computeHourlySpend() > this.hourlyThresholdCents ||
      this.currentDailySpend() > this.dailyBudgetCents
    );
  }

  private trip(now: number, from: LlmCostCircuitState): void {
    this.transitionTo('OPEN');
    this.openedAt = now;
    this.lastTripAt = now;
    this.probeInFlight = false;
    logger.warn('llm_cost_circuit_breaker_open', {
      hourlySpendCents: this.computeHourlySpend(),
      dailySpendCents: this.currentDailySpend(),
      hourlyThresholdCents: this.hourlyThresholdCents,
      dailyBudgetCents: this.dailyBudgetCents,
      from: from === 'HALF_OPEN' ? 'half_open' : 'closed',
    });
  }

  private transitionTo(next: LlmCostCircuitState): void {
    const prev = this.currentState;
    if (prev === next) return;
    this.currentState = next;
    this.onStateChange?.(next, prev);
  }
}
