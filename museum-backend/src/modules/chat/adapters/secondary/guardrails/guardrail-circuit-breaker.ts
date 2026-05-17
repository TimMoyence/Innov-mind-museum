import { logger } from '@shared/logger/logger';

/**
 * 3-state circuit breaker for LLM Guard sidecar HTTP (CLOSED → OPEN → HALF_OPEN).
 * Always-on (no enable flag); LLM_GUARD_CB_* env vars are tunables, not kill-switch.
 * Adds `halfOpenMaxProbes` accountant vs llm-circuit-breaker to avoid concurrent
 * probe hammering. Kept separate (KISS — only 2 consumers).
 */

export type GuardrailCircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface GuardrailCircuitBreakerSnapshot {
  state: GuardrailCircuitState;
  failureCount: number;
  lastFailureAt: Date | null;
  openedAt: Date | null;
}

export interface GuardrailCircuitBreakerOptions {
  failureThreshold?: number;
  windowMs?: number;
  openDurationMs?: number;
  halfOpenMaxProbes?: number;
  /** Wired by composition root for metrics. */
  onStateChange?: (next: GuardrailCircuitState, prev: GuardrailCircuitState) => void;
}

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_OPEN_DURATION_MS = 30_000;
const DEFAULT_HALF_OPEN_MAX_PROBES = 1;

/** NaN / ≤0 / non-finite → fallback (operator typo must not degrade breaker). */
function parsePositiveNumber(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

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
  /** OPEN→HALF_OPEN timestamp; feeds probeDurationMs on CLOSE (design.md §10). */
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

  /** Cheap getter — called per scan. Lazy OPEN→HALF_OPEN on cooldown elapse. */
  get state(): GuardrailCircuitState {
    if (this.currentState === 'OPEN' && this.openedAt !== null) {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed >= this.openDurationMs) {
        const openedAtIso = new Date(this.openedAt).toISOString();
        this.transitionTo('HALF_OPEN');
        this.openedAt = null;
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

  /** HALF_OPEN slot decremented synchronously so concurrent callers can't all sneak through. */
  canAttempt(): boolean {
    const state = this.state;
    if (state === 'CLOSED') return true;
    if (state === 'OPEN') return false;
    if (this.availableProbes <= 0) return false;
    this.availableProbes -= 1;
    return true;
  }

  /** HALF_OPEN → CLOSED; idempotent when already CLOSED. */
  recordSuccess(): void {
    if (this.currentState === 'HALF_OPEN') {
      const probeDurationMs = this.halfOpenedAt !== null ? Date.now() - this.halfOpenedAt : 0;
      this.transitionTo('CLOSED');
      this.failures = [];
      this.halfOpenedAt = null;
      this.availableProbes = this.halfOpenMaxProbes;
      logger.info('llm_guard_circuit_breaker_close', { probeDurationMs });
    }
  }

  /** Trips OPEN if sliding window exceeds threshold OR call was HALF_OPEN probe. */
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

  getState(): GuardrailCircuitBreakerSnapshot {
    return {
      state: this.state, // lazy OPEN→HALF_OPEN on expired cooldown
      failureCount: this.failures.length,
      lastFailureAt:
        this.failures.length > 0 ? new Date(this.failures[this.failures.length - 1]) : null,
      openedAt: this.openedAt !== null ? new Date(this.openedAt) : null,
    };
  }

  /** Test-only. */
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
    // Probe window ended; clear so next HALF_OPEN sets fresh baseline.
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
