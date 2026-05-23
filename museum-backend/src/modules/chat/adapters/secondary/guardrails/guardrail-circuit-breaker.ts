/**
 * 3-state circuit breaker for LLM Guard sidecar HTTP (CLOSED → OPEN → HALF_OPEN).
 * Always-on (no enable flag); LLM_GUARD_CB_* env vars are tunables, not kill-switch.
 * Adds `halfOpenMaxProbes` accountant to avoid concurrent probe hammering.
 *
 * PR-13 (RUN_ID 2026-05-23-pr-13-threeStateCircuit) refactor — FSM extracted
 * to `@shared/circuit-breaker/three-state-circuit`; sliding-window failure
 * trip predicate lives in `SlidingWindowFailureStrategy`. Public API and log
 * payloads preserved byte-identical (operators rely on Loki queries).
 */

import { SlidingWindowFailureStrategy } from '@shared/circuit-breaker/strategies/sliding-window-failure-strategy';
import { ThreeStateCircuit, type CircuitState } from '@shared/circuit-breaker/three-state-circuit';
import { logger } from '@shared/logger/logger';

export type GuardrailCircuitState = CircuitState;

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
  /** Test seam — defaults to `Date.now`. */
  now?: () => number;
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
  private readonly windowMs: number;
  private readonly nowFn: () => number;
  private readonly strategy: SlidingWindowFailureStrategy;
  private readonly circuit: ThreeStateCircuit<SlidingWindowFailureStrategy>;

  constructor(options: GuardrailCircuitBreakerOptions = {}) {
    const failureThreshold =
      options.failureThreshold ??
      parsePositiveNumber(process.env.LLM_GUARD_CB_FAILURE_THRESHOLD, DEFAULT_FAILURE_THRESHOLD);
    this.windowMs =
      options.windowMs ??
      parsePositiveNumber(process.env.LLM_GUARD_CB_WINDOW_MS, DEFAULT_WINDOW_MS);
    const openDurationMs =
      options.openDurationMs ??
      parsePositiveNumber(process.env.LLM_GUARD_CB_OPEN_DURATION_MS, DEFAULT_OPEN_DURATION_MS);
    const halfOpenMaxProbes =
      options.halfOpenMaxProbes ??
      parsePositiveNumber(
        process.env.LLM_GUARD_CB_HALF_OPEN_MAX_PROBES,
        DEFAULT_HALF_OPEN_MAX_PROBES,
      );
    this.nowFn = options.now ?? Date.now;
    const userOnStateChange = options.onStateChange;

    this.strategy = new SlidingWindowFailureStrategy({
      threshold: failureThreshold,
      windowMs: this.windowMs,
      now: this.nowFn,
    });
    this.circuit = new ThreeStateCircuit({
      strategy: this.strategy,
      openDurationMs,
      halfOpenMaxProbes,
      now: this.nowFn,
      onStateChange: (next, prev) => {
        if (next === 'HALF_OPEN') {
          const openedAtIso =
            this.circuit.openedAt !== null ? new Date(this.circuit.openedAt).toISOString() : null;
          logger.info('llm_guard_circuit_breaker_half_open', {
            openedAt: openedAtIso,
            windowMs: this.windowMs,
          });
        } else if (next === 'CLOSED' && prev === 'HALF_OPEN') {
          const probeDurationMs =
            this.circuit.halfOpenedAt !== null ? this.nowFn() - this.circuit.halfOpenedAt : 0;
          logger.info('llm_guard_circuit_breaker_close', { probeDurationMs });
        } else if (next === 'OPEN') {
          logger.warn('llm_guard_circuit_breaker_open', {
            failureCount: this.strategy.getFailureCount(),
            windowMs: this.windowMs,
            from: prev === 'HALF_OPEN' ? 'half_open' : 'closed',
          });
        }
        userOnStateChange?.(next, prev);
      },
    });
  }

  /** Cheap getter — called per scan. Lazy OPEN→HALF_OPEN on cooldown elapse. */
  get state(): GuardrailCircuitState {
    return this.circuit.state;
  }

  /** HALF_OPEN slot decremented synchronously so concurrent callers can't all sneak through. */
  canAttempt(): boolean {
    return this.circuit.canAttempt();
  }

  /** HALF_OPEN → CLOSED; idempotent when already CLOSED. */
  recordSuccess(): void {
    this.circuit.recordOutcome('success');
  }

  /** Trips OPEN if sliding window exceeds threshold OR call was HALF_OPEN probe. */
  recordFailure(): void {
    this.strategy.recordFailure();
    this.circuit.recordOutcome('failure');
  }

  getState(): GuardrailCircuitBreakerSnapshot {
    const state = this.circuit.state; // lazy OPEN→HALF_OPEN on expired cooldown
    const last = this.strategy.getLastFailureAt();
    return {
      state,
      failureCount: this.strategy.getFailureCount(),
      lastFailureAt: last !== null ? new Date(last) : null,
      openedAt: this.circuit.openedAt !== null ? new Date(this.circuit.openedAt) : null,
    };
  }

  /** Test-only. */
  reset(): void {
    this.circuit.reset();
  }
}
