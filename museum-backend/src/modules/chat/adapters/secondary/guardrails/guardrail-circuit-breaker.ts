import { logger } from '@shared/logger/logger';

/**
 * Three-state circuit breaker for the LLM Guard sidecar HTTP calls.
 *
 * Mirrors the proven shape of `adapters/secondary/llm/llm-circuit-breaker.ts`
 * but lives next to the guardrail adapter — distinct concern (sidecar HTTP vs
 * LLM provider API), distinct config namespace (`LLM_GUARD_CB_*`), distinct
 * lifecycle. We deliberately do NOT extract a shared abstraction yet (KISS,
 * `feedback_quality_doctrine` Rule 4 — premature with only two consumers).
 *
 * The breaker is ALWAYS-ON — there is no `*_ENABLED` flag
 * (`feedback_no_feature_flags_prelaunch`). The four env knobs below are
 * operational tunables, not a kill-switch.
 *
 * Adds one capability the LLM-side breaker doesn't have : a half-open probe
 * slot accountant (`halfOpenMaxProbes`) so we don't hammer a recovering
 * sidecar with concurrent probes.
 */

/** State of the breaker FSM. */
export type GuardrailCircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/** Snapshot returned by `getState()` for /api/health and observability. */
export interface GuardrailCircuitBreakerSnapshot {
  state: GuardrailCircuitState;
  failureCount: number;
  lastFailureAt: Date | null;
  openedAt: Date | null;
}

/** Constructor options — every field has a safe default. */
export interface GuardrailCircuitBreakerOptions {
  failureThreshold?: number;
  windowMs?: number;
  openDurationMs?: number;
  halfOpenMaxProbes?: number;
  /** Fired on every state transition. Used by the composition root to wire metrics. */
  onStateChange?: (next: GuardrailCircuitState, prev: GuardrailCircuitState) => void;
}

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_OPEN_DURATION_MS = 30_000;
const DEFAULT_HALF_OPEN_MAX_PROBES = 1;

/**
 * Parses a positive finite number from an env value. Falls back to the safe
 * default for NaN / ≤ 0 / non-finite — operator typos must NOT degrade the
 * breaker into a useless config (e.g. threshold=0 would trip on every call).
 */
function parsePositiveNumber(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

/** Three-state circuit breaker (CLOSED → OPEN → HALF_OPEN) for the LLM Guard sidecar. */
export class GuardrailCircuitBreaker {
  private readonly failureThreshold: number;
  private readonly windowMs: number;
  private readonly openDurationMs: number;
  private readonly halfOpenMaxProbes: number;
  private readonly onStateChange?: (
    next: GuardrailCircuitState,
    prev: GuardrailCircuitState,
  ) => void;

  private currentState: GuardrailCircuitState = 'CLOSED';
  private failures: number[] = [];
  private openedAt: number | null = null;
  /**
   * Wall-clock epoch (ms) at which the breaker transitioned OPEN→HALF_OPEN.
   * Used to compute `probeDurationMs` on the subsequent CLOSE event
   * (design.md §10 — observability fields). Cleared after the CLOSE log to
   * prevent stale carry-over into a future probe. NOT readonly — mutated on
   * every lazy OPEN→HALF_OPEN transition and on every CLOSE.
   */
  private halfOpenedAt: number | null = null;
  private availableProbes: number;

  constructor(options: GuardrailCircuitBreakerOptions = {}) {
    this.failureThreshold =
      options.failureThreshold ??
      parsePositiveNumber(process.env.LLM_GUARD_CB_FAILURE_THRESHOLD, DEFAULT_FAILURE_THRESHOLD);
    this.windowMs =
      options.windowMs ??
      parsePositiveNumber(process.env.LLM_GUARD_CB_WINDOW_MS, DEFAULT_WINDOW_MS);
    this.openDurationMs =
      options.openDurationMs ??
      parsePositiveNumber(process.env.LLM_GUARD_CB_OPEN_DURATION_MS, DEFAULT_OPEN_DURATION_MS);
    this.halfOpenMaxProbes =
      options.halfOpenMaxProbes ??
      parsePositiveNumber(
        process.env.LLM_GUARD_CB_HALF_OPEN_MAX_PROBES,
        DEFAULT_HALF_OPEN_MAX_PROBES,
      );
    this.onStateChange = options.onStateChange;
    this.availableProbes = this.halfOpenMaxProbes;
  }

  /**
   * Returns current state, transitioning OPEN → HALF_OPEN lazily when the
   * cooldown elapses. Reads must be cheap; this getter is called per scan.
   */
  get state(): GuardrailCircuitState {
    if (this.currentState === 'OPEN' && this.openedAt !== null) {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed >= this.openDurationMs) {
        // Capture `openedAt` BEFORE clearing it so the half_open log can emit
        // the ISO timestamp of when the breaker tripped (design.md §10).
        const openedAtIso = new Date(this.openedAt).toISOString();
        this.transitionTo('HALF_OPEN');
        this.openedAt = null;
        // Track when the probe window started so the subsequent CLOSE log
        // can emit `probeDurationMs` (design.md §10).
        this.halfOpenedAt = Date.now();
        this.availableProbes = this.halfOpenMaxProbes;
        logger.info('llm_guard_circuit_breaker_half_open', {
          openedAt: openedAtIso,
          windowMs: this.windowMs,
        });
      }
    }
    return this.currentState;
  }

  /**
   * Returns true when a call may proceed. CLOSED → always true. OPEN → false.
   * HALF_OPEN → true only while probe slots remain (slot is decremented
   * synchronously so concurrent callers cannot all sneak through).
   */
  canAttempt(): boolean {
    const state = this.state;
    if (state === 'CLOSED') return true;
    if (state === 'OPEN') return false;
    if (this.availableProbes <= 0) return false;
    this.availableProbes -= 1;
    return true;
  }

  /** Records a successful call. HALF_OPEN → CLOSED. Idempotent when already CLOSED. */
  recordSuccess(): void {
    if (this.currentState === 'HALF_OPEN') {
      // Compute probe duration BEFORE clearing `halfOpenedAt` (design.md §10).
      // Fallback to 0 if somehow null — shouldn't happen on this path because
      // every HALF_OPEN transition sets the field, but null-safe by design.
      const probeDurationMs = this.halfOpenedAt !== null ? Date.now() - this.halfOpenedAt : 0;
      this.transitionTo('CLOSED');
      this.failures = [];
      this.halfOpenedAt = null;
      this.availableProbes = this.halfOpenMaxProbes;
      logger.info('llm_guard_circuit_breaker_close', { probeDurationMs });
    }
  }

  /**
   * Records a failure. If the sliding window exceeds the threshold OR the
   * call was a HALF_OPEN probe, trips OPEN.
   */
  recordFailure(): void {
    const now = Date.now();
    this.failures.push(now);
    this.pruneExpiredFailures(now);

    if (this.currentState === 'HALF_OPEN') {
      this.trip(now, 'HALF_OPEN');
      return;
    }

    if (this.failures.length >= this.failureThreshold) {
      this.trip(now, 'CLOSED');
    }
  }

  /** Snapshot of internal state for /api/health and observability. */
  getState(): GuardrailCircuitBreakerSnapshot {
    return {
      state: this.state, // triggers lazy OPEN → HALF_OPEN transition if cooldown expired
      failureCount: this.failures.length,
      lastFailureAt:
        this.failures.length > 0 ? new Date(this.failures[this.failures.length - 1]) : null,
      openedAt: this.openedAt !== null ? new Date(this.openedAt) : null,
    };
  }

  /** Restores the breaker to CLOSED with no recorded failures. Used by tests. */
  reset(): void {
    const prev = this.currentState;
    this.currentState = 'CLOSED';
    this.failures = [];
    this.openedAt = null;
    this.halfOpenedAt = null;
    this.availableProbes = this.halfOpenMaxProbes;
    if (prev !== 'CLOSED') {
      this.onStateChange?.('CLOSED', prev);
    }
  }

  private trip(now: number, from: GuardrailCircuitState): void {
    this.transitionTo('OPEN');
    this.openedAt = now;
    // Probe window ended (failed) — clear so the next HALF_OPEN sets a fresh
    // baseline, and so any stray observer reading the field can't see a stale
    // value while the breaker is OPEN.
    this.halfOpenedAt = null;
    this.availableProbes = this.halfOpenMaxProbes;
    logger.warn('llm_guard_circuit_breaker_open', {
      failureCount: this.failures.length,
      windowMs: this.windowMs,
      from: from === 'HALF_OPEN' ? 'half_open' : 'closed',
    });
  }

  private transitionTo(next: GuardrailCircuitState): void {
    const prev = this.currentState;
    if (prev === next) return;
    this.currentState = next;
    this.onStateChange?.(next, prev);
  }

  private pruneExpiredFailures(now: number): void {
    const cutoff = now - this.windowMs;
    this.failures = this.failures.filter((ts) => ts > cutoff);
  }
}
