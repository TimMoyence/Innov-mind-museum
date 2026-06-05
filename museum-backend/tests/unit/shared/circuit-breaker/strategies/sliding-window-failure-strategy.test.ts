/**
 * UFR-022 red phase — PR-13 `SlidingWindowFailureStrategy` unit tests.
 * RUN_ID: 2026-05-23-pr-13-threeStateCircuit.
 *
 * Strategy used by `LLMCircuitBreaker` AND `GuardrailCircuitBreaker`. Encodes
 * the sliding-window failure-count trip predicate. The strategy file does NOT
 * exist yet — these tests fail with a `Cannot find module
 * '@shared/circuit-breaker/strategies/sliding-window-failure-strategy'` resolve
 * error pre-green (counts as RED).
 *
 * Pre-green failure mode: module not found.
 * Post-green expected: 6 cases pass (see design.md §6.2).
 *
 * Spec sources of truth:
 *   .claude/skills/team/team-state/2026-05-23-pr-13-threeStateCircuit/design.md §4.1
 *   .claude/skills/team/team-state/2026-05-23-pr-13-threeStateCircuit/tasks.md T2 / T7.b
 *
 * Frozen-test discipline (UFR-022): this file is sha256-hashed in
 * red-test-manifest.json. Green phase MUST NOT modify it. Suspected bug →
 * emit `BLOCK-TEST-WRONG <file>:<line> <reason>` and STOP.
 */
import { SlidingWindowFailureStrategy } from '@shared/circuit-breaker/strategies/sliding-window-failure-strategy';

/**
 * Mutable virtual clock.
 * @param start
 */
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

    clock.advance(10_001); // strictly past window
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

    // Record 3 failures (would trip immediately)
    strategy.recordFailure();
    strategy.recordFailure();
    strategy.recordFailure();
    expect(strategy.shouldTrip(clock.now())).toBe(true);

    // Advance past window. shouldTrip MUST prune lazily, returning false.
    clock.advance(10_001);
    expect(strategy.shouldTrip(clock.now())).toBe(false);
  });
});
