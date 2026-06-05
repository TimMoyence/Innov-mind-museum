/**
 * Generic 3-state circuit breaker FSM primitive (CLOSED → OPEN → HALF_OPEN).
 *
 * Domain-agnostic core extracted by PR-13 (RUN_ID 2026-05-23-pr-13-threeStateCircuit)
 * from 3 in-house wrappers (`LLMCircuitBreaker`, `LlmCostCircuitBreaker`,
 * `GuardrailCircuitBreaker`). Owns the FSM, the lazy `OPEN → HALF_OPEN`
 * cooldown transition, the probe-slot accountant and the `onStateChange`
 * observability signal. Trip-decision + failure-accounting are delegated to
 * a pluggable `CircuitTripStrategy` so each consumer can encode its own
 * predicate (sliding-window failure count, hourly/daily cost cap, …).
 *
 * Design references:
 *   - spec.md §3.4, §7 R1, §8 NFR-1..6
 *   - design.md §3.1, §3.3, §3.4, §3.5
 *
 * Discipline:
 *   - NO I/O, NO logging — wrappers own observability via `onStateChange`.
 *   - `now()` injection threaded everywhere so unit tests stay deterministic.
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Plug-in trip predicate consulted by the primitive on every failure outcome.
 * The strategy owns its internal mutation (sliding window of timestamps,
 * cost charges, …) — the primitive only asks "should I trip?".
 */
export interface CircuitTripStrategy {
  /** Returns true when the FSM should transition CLOSED → OPEN. */
  shouldTrip(now: number): boolean;
  /** Lazy pruning of internal time-bounded state. Idempotent. */
  pruneExpired(now: number): void;
  /**
   * FULL reset — clears ALL internal state, including durable accumulators
   * (e.g. the daily UTC cost cap). Called on the MANUAL `ThreeStateCircuit.reset()`
   * (kill-switch / operator / test): an operator who resets wants to start from a
   * clean slate. NOT called on probe-success recovery — use {@link resetTransient}
   * there. See W1-C1 (run 2026-05-26-kr-domains): wiping durable accumulators on
   * every probe-success recovery would recover the full daily-cap headroom each
   * cooldown cycle (×288/day), letting paid spend run far past the daily cap.
   */
  reset(): void;
  /**
   * TRANSIENT-only reset — clears the short-lived spike/window state but PRESERVES
   * durable rollover-bound accumulators. Called by `ThreeStateCircuit` on a probe
   * success (HALF_OPEN → CLOSED): the recovered breaker must not be pre-tripped by
   * a stale spike window, yet money already spent in the current UTC day must still
   * count against the daily cap. For strategies whose entire state is transient
   * (e.g. {@link import('./strategies/sliding-window-failure-strategy').SlidingWindowFailureStrategy}),
   * this is byte-identical to {@link reset} — no behavioral change. See W1-C1.
   */
  resetTransient(): void;
}

export interface ThreeStateCircuitOptions<TStrategy extends CircuitTripStrategy> {
  strategy: TStrategy;
  openDurationMs: number;
  /** Max concurrent probes admitted in `HALF_OPEN`. Default 1. */
  halfOpenMaxProbes?: number;
  /** Fires on every real FSM transition (and on `reset()` IFF state changed). */
  onStateChange?: (next: CircuitState, prev: CircuitState) => void;
  /** Test seam — defaults to `Date.now`. */
  now?: () => number;
}

export interface ThreeStateCircuitCommonSnapshot {
  state: CircuitState;
  openedAt: Date | null;
  lastTripAt: Date | null;
}

const DEFAULT_HALF_OPEN_MAX_PROBES = 1;

export class ThreeStateCircuit<TStrategy extends CircuitTripStrategy> {
  private currentState: CircuitState = 'CLOSED';
  private openedAtMs: number | null = null;
  private lastTripAtMs: number | null = null;
  private halfOpenedAtMs: number | null = null;
  private availableProbes: number;
  /**
   * TD-67: tracks whether a HALF_OPEN probe slot has been admitted by
   * `canAttempt()` but not yet accounted for by `recordOutcome()`. Lets
   * `releaseProbe()` return exactly ONE outstanding slot to the pool on a
   * caller exception (try/finally), without over-releasing on repeated calls.
   * Set on probe admission, cleared on any slot-restoring transition
   * (`recordOutcome`, `trip`, `reset`) and by `releaseProbe()` itself.
   */
  private hasOutstandingProbe = false;

  private readonly strategy: TStrategy;
  private readonly openDurationMs: number;
  private readonly halfOpenMaxProbes: number;
  private readonly onStateChange?: (next: CircuitState, prev: CircuitState) => void;
  private readonly nowFn: () => number;

  constructor(options: ThreeStateCircuitOptions<TStrategy>) {
    this.strategy = options.strategy;
    this.openDurationMs = options.openDurationMs;
    this.halfOpenMaxProbes = options.halfOpenMaxProbes ?? DEFAULT_HALF_OPEN_MAX_PROBES;
    this.onStateChange = options.onStateChange;
    this.nowFn = options.now ?? Date.now;
    this.availableProbes = this.halfOpenMaxProbes;
  }

  /** Lazy `OPEN → HALF_OPEN` once cooldown elapses. Cheap (O(1)). */
  get state(): CircuitState {
    if (this.currentState === 'OPEN' && this.openedAtMs !== null) {
      const elapsed = this.nowFn() - this.openedAtMs;
      if (elapsed >= this.openDurationMs) {
        // Note: openedAtMs is intentionally preserved across the
        // `transitionTo` call so wrapper `onStateChange` handlers can read
        // the original trip timestamp for log payloads (e.g. guardrail
        // `openedAt: <ISO>`). It is cleared AFTER the callback fires to
        // match the historical post-transition snapshot contract
        // (`getState().openedAt === null` once HALF_OPEN).
        this.halfOpenedAtMs = this.nowFn();
        this.availableProbes = this.halfOpenMaxProbes;
        this.transitionTo('HALF_OPEN');
        this.openedAtMs = null;
      }
    }
    return this.currentState;
  }

  get openedAt(): number | null {
    return this.openedAtMs;
  }

  get halfOpenedAt(): number | null {
    return this.halfOpenedAtMs;
  }

  get lastTripAt(): number | null {
    return this.lastTripAtMs;
  }

  /** CLOSED → true ; OPEN → false ; HALF_OPEN → decrement probe slot. */
  canAttempt(): boolean {
    const state = this.state;
    if (state === 'CLOSED') return true;
    if (state === 'OPEN') return false;
    if (this.availableProbes <= 0) return false;
    this.availableProbes -= 1;
    // TD-67: mark that an unaccounted probe is now in flight so a caller that
    // throws before `recordOutcome()` can return the slot via `releaseProbe()`.
    this.hasOutstandingProbe = true;
    return true;
  }

  /**
   * TD-67: return an admitted-but-unrecorded HALF_OPEN probe slot to the pool.
   *
   * Intended for the caller's `finally` block when an exception is thrown
   * between `canAttempt()` returning `true` and `recordOutcome()` being
   * reached: without this, the consumed slot is never restored and a
   * `halfOpenMaxProbes=1` breaker locks out permanently (the OPEN cooldown no
   * longer applies once HALF_OPEN). Idempotent and conservative:
   *   - No-op unless the FSM is HALF_OPEN with an outstanding admitted probe.
   *   - Restores at most ONE slot per admission (capped at `halfOpenMaxProbes`),
   *     so repeated calls without an intervening `canAttempt()` never inflate
   *     the pool past the configured cap.
   *
   * Stays NO-I/O / NO-logging to preserve the primitive purity contract
   * (see header §Discipline + pr13 purity sentinel).
   */
  releaseProbe(): void {
    if (this.state !== 'HALF_OPEN') return;
    if (!this.hasOutstandingProbe) return;
    if (this.availableProbes < this.halfOpenMaxProbes) {
      this.availableProbes += 1;
    }
    this.hasOutstandingProbe = false;
  }

  /**
   * Drives the FSM on a success/failure outcome. On failure in CLOSED, consults
   * `strategy.shouldTrip(now)` to decide whether to trip.
   */
  recordOutcome(outcome: 'success' | 'failure'): void {
    const now = this.nowFn();
    const state = this.state;

    if (outcome === 'success') {
      if (state === 'HALF_OPEN') {
        this.transitionTo('CLOSED');
        // W1-C1: transient-only reset on probe success — clears the spike window
        // but preserves durable accumulators (e.g. CostTripStrategy's daily UTC
        // cap). Full `reset()` is reserved for the manual kill-switch path below.
        this.strategy.resetTransient();
        this.halfOpenedAtMs = null;
        this.availableProbes = this.halfOpenMaxProbes;
        this.hasOutstandingProbe = false; // TD-67: probe accounted for.
      }
      return;
    }

    // failure
    if (state === 'HALF_OPEN') {
      this.trip('HALF_OPEN');
      return;
    }
    if (state === 'CLOSED') {
      this.strategy.pruneExpired(now);
      if (this.strategy.shouldTrip(now)) {
        this.trip('CLOSED');
      }
    }
  }

  /** Strategy-driven hard trip (e.g. cost spike inside `recordCharge`). */
  trip(from: CircuitState): void {
    const now = this.nowFn();
    this.openedAtMs = now;
    this.lastTripAtMs = now;
    this.halfOpenedAtMs = null;
    this.availableProbes = this.halfOpenMaxProbes;
    this.hasOutstandingProbe = false; // TD-67: slot pool reset on trip.
    this.transitionTo('OPEN', from);
  }

  /** Restore CLOSED. Fires `onStateChange` IFF prior state ≠ CLOSED. */
  reset(): void {
    const prev = this.currentState;
    this.openedAtMs = null;
    this.halfOpenedAtMs = null;
    this.lastTripAtMs = null;
    this.availableProbes = this.halfOpenMaxProbes;
    this.hasOutstandingProbe = false; // TD-67: slot pool reset on manual reset.
    this.strategy.reset();
    if (prev !== 'CLOSED') {
      this.currentState = 'CLOSED';
      this.onStateChange?.('CLOSED', prev);
    }
  }

  getCommonSnapshot(): ThreeStateCircuitCommonSnapshot {
    return {
      state: this.state,
      openedAt: this.openedAtMs !== null ? new Date(this.openedAtMs) : null,
      lastTripAt: this.lastTripAtMs !== null ? new Date(this.lastTripAtMs) : null,
    };
  }

  private transitionTo(next: CircuitState, from?: CircuitState): void {
    const prev = from ?? this.currentState;
    if (prev === next) return;
    this.currentState = next;
    this.onStateChange?.(next, prev);
  }
}
