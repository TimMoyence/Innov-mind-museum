export type BreakerStateName = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface BreakerState {
  name: BreakerStateName;
  /** Ms epoch of most recent OPEN transition; carried through HALF_OPEN. */
  openSince?: number;
}
