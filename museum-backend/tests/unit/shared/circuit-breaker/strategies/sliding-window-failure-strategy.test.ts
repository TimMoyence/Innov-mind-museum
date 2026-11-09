import { SlidingWindowFailureStrategy } from '@shared/circuit-breaker/strategies/sliding-window-failure-strategy';

function makeClock(start = 1_700_000_000_000): {
  now: () => number;
  advance: (ms: number) => void;
} {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe('SlidingWindowFailureStrategy', () => {
  it('recordFailure() appends a timestamp; getFailureCount reflects count', () => {
    const clock = makeClock();
    const strategy = new SlidingWindowFailureStrategy({
      threshold: 5,
      windowMs: 60_000,
      now: clock.now,
    });

    expect(strategy.getFailureCount()).toBe(0);
    strategy.recordFailure();
    expect(strategy.getFailureCount()).toBe(1);
    strategy.recordFailure();
    strategy.recordFailure();
    expect(strategy.getFailureCount()).toBe(3);
  });

  it('shouldTrip() false below threshold, true at threshold', () => {
    const clock = makeClock();
    const strategy = new SlidingWindowFailureStrategy({
      threshold: 3,
      windowMs: 60_000,
      now: clock.now,
    });

    strategy.recordFailure();
    strategy.recordFailure();
    expect(strategy.shouldTrip(clock.now())).toBe(false);

    strategy.recordFailure();
    expect(strategy.shouldTrip(clock.now())).toBe(true);
  });

  it('pruneExpired() drops failures older than windowMs', () => {
    const clock = makeClock();
    const strategy = new SlidingWindowFailureStrategy({
      threshold: 5,
      windowMs: 10_000,
      now: clock.now,
    });

    strategy.recordFailure();
    strategy.recordFailure();
    expect(strategy.getFailureCount()).toBe(2);

    clock.advance(10_001);
    strategy.pruneExpired(clock.now());

    expect(strategy.getFailureCount()).toBe(0);
  });

  it('reset() clears the failures array (count returns to 0)', () => {
    const clock = makeClock();
    const strategy = new SlidingWindowFailureStrategy({
      threshold: 3,
      windowMs: 60_000,
      now: clock.now,
    });

    strategy.recordFailure();
    strategy.recordFailure();
    strategy.recordFailure();
    expect(strategy.shouldTrip(clock.now())).toBe(true);

    strategy.reset();

    expect(strategy.getFailureCount()).toBe(0);
    expect(strategy.shouldTrip(clock.now())).toBe(false);
  });

  it('getLastFailureAt() returns the most recent failure timestamp', () => {
    const clock = makeClock();
    const strategy = new SlidingWindowFailureStrategy({
      threshold: 5,
      windowMs: 60_000,
      now: clock.now,
    });

    expect(strategy.getLastFailureAt()).toBeNull();

    strategy.recordFailure();
    const t1 = clock.now();
    expect(strategy.getLastFailureAt()).toBe(t1);

    clock.advance(5_000);
    strategy.recordFailure();
    const t2 = clock.now();
    expect(strategy.getLastFailureAt()).toBe(t2);
  });

  it('shouldTrip() lazily prunes expired failures before evaluating threshold', () => {
    const clock = makeClock();
    const strategy = new SlidingWindowFailureStrategy({
      threshold: 3,
      windowMs: 10_000,
      now: clock.now,
    });

    strategy.recordFailure();
    strategy.recordFailure();
    strategy.recordFailure();
    expect(strategy.shouldTrip(clock.now())).toBe(true);

    clock.advance(10_001);
    expect(strategy.shouldTrip(clock.now())).toBe(false);
  });
});
