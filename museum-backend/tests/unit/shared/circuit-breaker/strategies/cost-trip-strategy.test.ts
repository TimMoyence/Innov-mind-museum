import { CostTripStrategy } from '@shared/circuit-breaker/strategies/cost-trip-strategy';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

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
      dailyBudgetCents: 10_000,
      now: clock.now,
    });

    strategy.recordCharge(60);
    strategy.recordCharge(50);
    expect(strategy.shouldTrip(clock.now())).toBe(true);
    expect(strategy.getHourlySpendCents(clock.now())).toBe(110);
  });

  it('daily budget breach trips even when hourly < threshold (charges spread across hours)', () => {
    const clock = makeClock();
    const strategy = new CostTripStrategy({
      hourlyThresholdCents: 10_000,
      dailyBudgetCents: 500,
      now: clock.now,
    });

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

    clock.advance(DAY_MS);
    strategy.recordCharge(50);

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

    strategy.recordCharge(200);
    expect(strategy.shouldTrip(clock.now())).toBe(true);

    strategy.reset();

    expect(strategy.getHourlySpendCents(clock.now())).toBe(0);
    expect(strategy.shouldTrip(clock.now())).toBe(false);
  });

  it('resetTransient() clears the hourly window but PRESERVES the daily accumulator', () => {
    const clock = makeClock();
    const strategy = new CostTripStrategy({
      hourlyThresholdCents: 100,
      dailyBudgetCents: 10_000,
      now: clock.now,
    });

    strategy.recordCharge(200);

    strategy.resetTransient();

    expect(strategy.getHourlySpendCents(clock.now())).toBe(0);
    expect(strategy.getDailySpendCents(clock.now())).toBe(200);
  });

  it('resetTransient() leaves a daily-cap breach still tripping', () => {
    const clock = makeClock();
    const strategy = new CostTripStrategy({
      hourlyThresholdCents: 10_000,
      dailyBudgetCents: 500,
      now: clock.now,
    });

    strategy.recordCharge(200);
    clock.advance(HOUR_MS + 1);
    strategy.recordCharge(200);
    clock.advance(HOUR_MS + 1);
    strategy.recordCharge(200);

    expect(strategy.getDailySpendCents(clock.now())).toBe(600);

    strategy.resetTransient();

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

    strategy.recordCharge(300);
    expect(strategy.getDailySpendCents(clock.now())).toBe(300);

    strategy.reset();

    expect(strategy.getHourlySpendCents(clock.now())).toBe(0);
    expect(strategy.getDailySpendCents(clock.now())).toBe(0);
  });
});
