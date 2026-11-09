export type BreakerStateName = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface BreakerState {
  name: BreakerStateName;
  openSince?: number;
}
