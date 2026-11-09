export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitTripStrategy {
  shouldTrip(now: number): boolean;
  pruneExpired(now: number): void;
  reset(): void;
  resetTransient(): void;
}

export interface ThreeStateCircuitOptions<TStrategy extends CircuitTripStrategy> {
  strategy: TStrategy;
  openDurationMs: number;
  halfOpenMaxProbes?: number;
  onStateChange?: (next: CircuitState, prev: CircuitState) => void;
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

  get state(): CircuitState {
    if (this.currentState === 'OPEN' && this.openedAtMs !== null) {
      const elapsed = this.nowFn() - this.openedAtMs;
      if (elapsed >= this.openDurationMs) {
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

  canAttempt(): boolean {
    const state = this.state;
    if (state === 'CLOSED') return true;
    if (state === 'OPEN') return false;
    if (this.availableProbes <= 0) return false;
    this.availableProbes -= 1;
    this.hasOutstandingProbe = true;
    return true;
  }

  releaseProbe(): void {
    if (this.state !== 'HALF_OPEN') return;
    if (!this.hasOutstandingProbe) return;
    if (this.availableProbes < this.halfOpenMaxProbes) {
      this.availableProbes += 1;
    }
    this.hasOutstandingProbe = false;
  }

  recordOutcome(outcome: 'success' | 'failure'): void {
    const now = this.nowFn();
    const state = this.state;

    if (outcome === 'success') {
      if (state === 'HALF_OPEN') {
        this.transitionTo('CLOSED');
        this.strategy.resetTransient();
        this.halfOpenedAtMs = null;
        this.availableProbes = this.halfOpenMaxProbes;
        this.hasOutstandingProbe = false;
      }
      return;
    }

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

  trip(from: CircuitState): void {
    const now = this.nowFn();
    this.openedAtMs = now;
    this.lastTripAtMs = now;
    this.halfOpenedAtMs = null;
    this.availableProbes = this.halfOpenMaxProbes;
    this.hasOutstandingProbe = false;
    this.transitionTo('OPEN', from);
  }

  reset(): void {
    const prev = this.currentState;
    this.openedAtMs = null;
    this.halfOpenedAtMs = null;
    this.lastTripAtMs = null;
    this.availableProbes = this.halfOpenMaxProbes;
    this.hasOutstandingProbe = false;
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
