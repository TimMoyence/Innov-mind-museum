/**
 * Cost-based circuit breaker for LLM API spend (perennial design §11 D9 — RE2).
 *
 * Distinct from the latency `LLMCircuitBreaker` (ADR-047):
 *   - Latency CB trips on `failureThreshold` failures in a sliding window.
 *   - Cost CB trips on cost SPIKES (e.g. scraping abuse, DDoS amplification)
 *     and on the cumulative daily cap being breached.
 *
 * Two trip conditions, ORed:
 *   1. Hourly spend exceeds `hourlyThresholdCents` — guards against
 *      anomalous bursts (a single bot draining $$ in minutes).
 *   2. Daily spend exceeds `dailyBudgetCents` — global cap. Overlaps with
 *      the `guardrail-budget` LLM-judge cap but is wider in scope: this
 *      breaker can be wired around ANY costed LLM call, not just judging.
 *
 * Storage is in-process (rolling 1-hour window + UTC-midnight daily counter).
 * Acceptable trade-off for V1 single-instance + KISS — Phase 3 (B2B onset)
 * promotes to Redis if/when multi-instance horizontal scale lands.
 *
 * Fail-CLOSED contract: when OPEN, `canAttempt()` returns false and callers
 * MUST short-circuit with a 503-equivalent. NEVER fail-open silently —
 * cost protection is a safety guarantee, not a soft hint.
 */

import { logger } from '@shared/logger/logger';

/** State of the cost-breaker FSM (mirrors `GuardrailCircuitBreaker` taxonomy). */
export type LlmCostCircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/** Snapshot for /api/health and observability. */
export interface LlmCostCircuitBreakerSnapshot {
  state: LlmCostCircuitState;
  hourlySpendCents: number;
  dailySpendCents: number;
  lastTripAt: Date | null;
  openedAt: Date | null;
}

/** Constructor options. Every field has a sane default. */
export interface LlmCostCircuitBreakerOptions {
  /** Cents/hour threshold above which the breaker trips OPEN (anomaly guard). */
  hourlyThresholdCents?: number;
  /** Daily cap (cents) — cumulative spend over a UTC day before tripping. */
  dailyBudgetCents?: number;
  /** Cooldown (ms) after which an OPEN breaker becomes HALF_OPEN. */
  openDurationMs?: number;
  /** Fired on every state transition. Used by composition root to wire metrics. */
  onStateChange?: (next: LlmCostCircuitState, prev: LlmCostCircuitState) => void;
  /** Test seam — defaults to `Date.now()`. Lets tests advance the clock. */
  now?: () => number;
}

const DEFAULT_HOURLY_THRESHOLD_CENTS = 5_000; // $50/h spike alarm
const DEFAULT_DAILY_BUDGET_CENTS = 50_000; // $500/day hard cap
const DEFAULT_OPEN_DURATION_MS = 300_000; // 5 min cooldown
const HOUR_MS = 3_600_000;

/** Single charge entry kept in the 1-hour rolling window. */
interface CostEntry {
  /** Timestamp (ms epoch) of the charge. */
  at: number;
  /** Amount in cents. Guaranteed positive (negatives rejected by `record`). */
  cents: number;
}

const utcDayKey = (epochMs: number): string => new Date(epochMs).toISOString().slice(0, 10);

/**
 * Cost-based 3-state circuit breaker. CLOSED → OPEN on cost anomaly or daily
 * cap breach. OPEN → HALF_OPEN after cooldown. HALF_OPEN admits ONE probe
 * charge; failure (probe + state still tripping) returns to OPEN, success
 * (probe + within thresholds) returns to CLOSED.
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
  /** Rolling charges within the past hour. Pruned lazily on each access. */
  private hourlyCharges: CostEntry[] = [];
  /** UTC-day spend counter. Resets when day changes. */
  private dailySpend = { day: '', cents: 0 };
  /** Reserved when HALF_OPEN to ensure only ONE probe at a time. */
  private probeInFlight = false;

  constructor(options: LlmCostCircuitBreakerOptions = {}) {
    this.hourlyThresholdCents = options.hourlyThresholdCents ?? DEFAULT_HOURLY_THRESHOLD_CENTS;
    this.dailyBudgetCents = options.dailyBudgetCents ?? DEFAULT_DAILY_BUDGET_CENTS;
    this.openDurationMs = options.openDurationMs ?? DEFAULT_OPEN_DURATION_MS;
    this.onStateChange = options.onStateChange;
    this.now = options.now ?? Date.now;
  }

  /**
   * Returns the current state, transitioning OPEN → HALF_OPEN lazily once the
   * cooldown elapses. Cheap to call per-request — no I/O.
   */
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
   * Returns true when a costed LLM call may proceed.
   *
   *   CLOSED    → true (always)
   *   OPEN      → false
   *   HALF_OPEN → true ONLY for the first caller, false for concurrent ones
   *               (probe slot decremented synchronously).
   */
  canAttempt(): boolean {
    const state = this.state;
    if (state === 'CLOSED') return true;
    if (state === 'OPEN') return false;
    // HALF_OPEN — single probe slot, race-safe via sync mutation.
    if (this.probeInFlight) return false;
    this.probeInFlight = true;
    return true;
  }

  /**
   * Records a successful charge. If HALF_OPEN, recovers to CLOSED.
   * Pure cost accumulation otherwise — no state change in CLOSED.
   */
  recordCharge(cents: number): void {
    if (!Number.isFinite(cents) || cents <= 0) return;
    const now = this.now();
    this.appendCharge(now, cents);

    // Trip checks BEFORE the HALF_OPEN recovery so we honour cap breaches
    // even on the probe call.
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

  /**
   * Records a failed LLM call (no cost charged but the probe attempt is
   * consumed). If HALF_OPEN, re-trips OPEN.
   */
  recordFailure(): void {
    if (this.currentState === 'HALF_OPEN') {
      this.trip(this.now(), 'HALF_OPEN');
    }
  }

  /** Snapshot of internal state for /api/health + observability. */
  getState(): LlmCostCircuitBreakerSnapshot {
    return {
      state: this.state, // triggers lazy OPEN → HALF_OPEN if cooldown elapsed
      hourlySpendCents: this.computeHourlySpend(),
      dailySpendCents: this.currentDailySpend(),
      lastTripAt: this.lastTripAt !== null ? new Date(this.lastTripAt) : null,
      openedAt: this.openedAt !== null ? new Date(this.openedAt) : null,
    };
  }

  /** Restores breaker to CLOSED with no recorded spend. Test-only. */
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

  /** Appends a charge to both rolling and daily counters. */
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
