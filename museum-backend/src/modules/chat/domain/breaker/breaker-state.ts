/** Symbolic name of a circuit-breaker's current state. */
export type BreakerStateName = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/** Snapshot of a circuit-breaker exposed to the application layer. */
export interface BreakerState {
  name: BreakerStateName;
  /** Timestamp (ms epoch) of the most recent OPEN transition ; carried through HALF_OPEN. */
  openSince?: number;
}
