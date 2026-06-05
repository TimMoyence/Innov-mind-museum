/**
 * UFR-022 red phase — PR-13 `CostTripStrategy` unit tests.
 * RUN_ID: 2026-05-23-pr-13-threeStateCircuit.
 *
 * Cost-based trip strategy used by `LlmCostCircuitBreaker`. Encodes the dual
 * predicate (hourly window OR daily UTC budget). The strategy file does NOT
 * exist yet — these tests fail with a `Cannot find module
 * '@shared/circuit-breaker/strategies/cost-trip-strategy'` resolve error
 * pre-green (counts as RED).
 *
 * Pre-green failure mode: module not found.
 * Post-green expected: 7 cases pass (see design.md §6.3).
 *
 * Spec sources of truth:
 *   .claude/skills/team/team-state/2026-05-23-pr-13-threeStateCircuit/design.md §4.2
 *   .claude/skills/team/team-state/2026-05-23-pr-13-threeStateCircuit/tasks.md T3 / T7.c
 *
 * Frozen-test discipline (UFR-022): this file is sha256-hashed in
 * red-test-manifest.json. Green phase MUST NOT modify it. Suspected bug →
 * emit `BLOCK-TEST-WRONG <file>:<line> <reason>` and STOP.
 */
import { CostTripStrategy } from '@shared/circuit-breaker/strategies/cost-trip-strategy';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Mutable virtual clock anchored at a UTC midnight to keep day-key math sharp.
 * @param start
 */
function makeClock(start = Date.UTC(2026, 4, 23, 0, 0, 0)): {
  now: () => number;
  advance: (ms: number) => void;
  set: (epoch: number) => void;
} {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
    set: (epoch: number) => {
      t = epoch;
    },
  };
}

describe('CostTripStrategy', () => {
  it('recordCharge(<=0 | NaN | Infinity | -5) is a no-op', () => {
    const clock = makeClock();
    const strategy = new CostTripStrategy({
      hourlyThresholdCents: 100,
      dailyBudgetCents: 1_000,
      now: clock.now,
    });

    strategy.recordCharge(0);
    strategy.recordCharge(-5);
    strategy.recordCharge(Number.NaN);
    strategy.recordCharge(Number.POSITIVE_INFINITY);

    expect(strategy.getHourlySpendCents(clock.now())).toBe(0);
    expect(strategy.getDailySpendCents(clock.now())).toBe(0);
    expect(strategy.shouldTrip(clock.now())).toBe(false);
  });

  it('hourly threshold breach trips (shouldTrip → true) even when daily is below budget', () => {
    const clock = makeClock();
    const strategy = new CostTripStrategy({
      hourlyThresholdCents: 100,
      dailyBudgetCents: 10_000, // ample
      now: clock.now,
    });

    strategy.recordCharge(60);
    strategy.recordCharge(50); // total 110 > 100 hourly threshold
    expect(strategy.shouldTrip(clock.now())).toBe(true);
    expect(strategy.getHourlySpendCents(clock.now())).toBe(110);
  });

  it('daily budget breach trips even when hourly < threshold (charges spread across hours)', () => {
    const clock = makeClock();
    const strategy = new CostTripStrategy({
      hourlyThresholdCents: 10_000, // very high
      dailyBudgetCents: 500,
      now: clock.now,
    });

    // Three hours of 200c each — hourly stays at 200 (last hour only),
    // but the daily counter accumulates to 600 > 500.
    strategy.recordCharge(200);
    clock.advance(HOUR_MS + 1);
    strategy.recordCharge(200);
    clock.advance(HOUR_MS + 1);
    strategy.recordCharge(200);

    expect(strategy.getHourlySpendCents(clock.now())).toBeLessThanOrEqual(200);
    expect(strategy.getDailySpendCents(clock.now())).toBe(600);
    expect(strategy.shouldTrip(clock.now())).toBe(true);
  });

  it('hourly window prunes entries strictly older than 1h', () => {
    const clock = makeClock();
    const strategy = new CostTripStrategy({
      hourlyThresholdCents: 1_000,
      dailyBudgetCents: 100_000,
      now: clock.now,
    });

    strategy.recordCharge(200);
    expect(strategy.getHourlySpendCents(clock.now())).toBe(200);

    // Advance past the hour and force an evaluation that prunes lazily.
    clock.advance(HOUR_MS + 1);
    expect(strategy.getHourlySpendCents(clock.now())).toBe(0);
  });

  it('UTC day rollover resets daily counter on next recordCharge', () => {
    const clock = makeClock();
    const strategy = new CostTripStrategy({
      hourlyThresholdCents: 100_000,
      dailyBudgetCents: 10_000,
      now: clock.now,
    });

    strategy.recordCharge(300);
    expect(strategy.getDailySpendCents(clock.now())).toBe(300);

    // Cross UTC midnight
    clock.advance(DAY_MS);
    strategy.recordCharge(50);

    // Daily counter was 300 in day N; should be 50 in day N+1.
    expect(strategy.getDailySpendCents(clock.now())).toBe(50);
  });

  it('getHourlySpendCents and getDailySpendCents reflect mutation after recordCharge', () => {
    const clock = makeClock();
    const strategy = new CostTripStrategy({
      hourlyThresholdCents: 10_000,
      dailyBudgetCents: 100_000,
      now: clock.now,
    });

    strategy.recordCharge(100);
    strategy.recordCharge(250);

    expect(strategy.getHourlySpendCents(clock.now())).toBe(350);
    expect(strategy.getDailySpendCents(clock.now())).toBe(350);
  });

  it('reset() clears hourly window so a fresh probe is not pre-tripped by stale charges', () => {
    const clock = makeClock();
    const strategy = new CostTripStrategy({
      hourlyThresholdCents: 100,
      dailyBudgetCents: 10_000,
      now: clock.now,
    });

    strategy.recordCharge(200); // would trip hourly
    expect(strategy.shouldTrip(clock.now())).toBe(true);

    strategy.reset();

    expect(strategy.getHourlySpendCents(clock.now())).toBe(0);
    expect(strategy.shouldTrip(clock.now())).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // W1-C1 RED — transient vs full reset semantics (run 2026-05-26-kr-domains).
  // The probe-success path of `ThreeStateCircuit` must reset ONLY the transient
  // hourly spike window, NOT the durable daily UTC accumulator. These three
  // cases pin the new `resetTransient()` contract on `CostTripStrategy`.
  //
  // RED failure mode at be758ab56: `resetTransient` does not exist on
  // `CostTripStrategy` → ts-jest compile error ("Property 'resetTransient' does
  // not exist on type 'CostTripStrategy'"). Counts as RED (design.md §6 / AC-C1).
  // ---------------------------------------------------------------------------

  it('resetTransient() clears the hourly window but PRESERVES the daily accumulator', () => {
    const clock = makeClock();
    const strategy = new CostTripStrategy({
      hourlyThresholdCents: 100,
      dailyBudgetCents: 10_000, // ample — daily not breached
      now: clock.now,
    });

    strategy.recordCharge(200); // counts toward BOTH hourly and daily

    strategy.resetTransient();

    // Hourly spike window wiped (so a fresh probe is not pre-tripped),
    // but the daily UTC accumulator is intact (money already spent today).
    expect(strategy.getHourlySpendCents(clock.now())).toBe(0);
    expect(strategy.getDailySpendCents(clock.now())).toBe(200);
  });

  it('resetTransient() leaves a daily-cap breach still tripping', () => {
    const clock = makeClock();
    const strategy = new CostTripStrategy({
      hourlyThresholdCents: 10_000, // very high — hourly can NOT trip
      dailyBudgetCents: 500,
      now: clock.now,
    });

    // Spread 200c × 3 across separate hours so the hourly window holds ≤200
    // while the daily counter accumulates to 600 > 500.
    strategy.recordCharge(200);
    clock.advance(HOUR_MS + 1);
    strategy.recordCharge(200);
    clock.advance(HOUR_MS + 1);
    strategy.recordCharge(200);

    expect(strategy.getDailySpendCents(clock.now())).toBe(600);

    strategy.resetTransient();

    // Hourly window emptied, but the daily breach (600 > 500) still trips.
    expect(strategy.getHourlySpendCents(clock.now())).toBe(0);
    expect(strategy.shouldTrip(clock.now())).toBe(true);
  });

  it('reset() (full) clears BOTH the hourly window and the daily accumulator', () => {
    const clock = makeClock();
    const strategy = new CostTripStrategy({
      hourlyThresholdCents: 10_000,
      dailyBudgetCents: 500,
      now: clock.now,
    });

    strategy.recordCharge(300); // daily = 300
    expect(strategy.getDailySpendCents(clock.now())).toBe(300);

    strategy.reset(); // manual / kill-switch full reset

    expect(strategy.getHourlySpendCents(clock.now())).toBe(0);
    expect(strategy.getDailySpendCents(clock.now())).toBe(0);
  });
});
