/**
 * 2026-05-13 — Cost-based circuit breaker tests (perennial design §11 D9 / RE2).
 *
 * Covers the 3-state FSM (CLOSED → OPEN → HALF_OPEN → CLOSED|OPEN), trip
 * conditions (hourly spike + daily cap), and the probe slot. Uses a controlled
 * clock (`options.now`) to avoid coupling to Jest fake timers — the breaker
 * reads `now()` directly so the test seam is exact.
 */
import { LlmCostCircuitBreaker } from '@modules/chat/adapters/secondary/llm/llm-cost-circuit-breaker';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

/**
 * Helper that creates a breaker bound to a mutable clock cursor. Returning
 * `tick` lets each test advance time deterministically — far less brittle
 * than `jest.advanceTimersByTime` which only moves macro task timers.
 * @param overrides
 */
function makeBreaker(overrides: ConstructorParameters<typeof LlmCostCircuitBreaker>[0] = {}): {
  breaker: LlmCostCircuitBreaker;
  tick: (deltaMs: number) => void;
} {
  let cursor = new Date('2026-05-13T10:00:00Z').getTime();
  const breaker = new LlmCostCircuitBreaker({
    hourlyThresholdCents: 1_000, // $10/h spike
    dailyBudgetCents: 5_000, // $50/day cap
    openDurationMs: 60_000, // 1 min cooldown
    now: () => cursor,
    ...overrides,
  });
  return {
    breaker,
    tick: (deltaMs: number) => {
      cursor += deltaMs;
    },
  };
}

describe('LlmCostCircuitBreaker — nominal CLOSED path', () => {
  it('starts CLOSED and lets every call through', () => {
    const { breaker } = makeBreaker();
    expect(breaker.state).toBe('CLOSED');
    expect(breaker.canAttempt()).toBe(true);
    expect(breaker.canAttempt()).toBe(true);
  });

  it('accumulates spend without tripping while under thresholds', () => {
    const { breaker } = makeBreaker();
    for (let i = 0; i < 9; i += 1) {
      breaker.recordCharge(100); // 9 × $1 = $9
    }
    expect(breaker.state).toBe('CLOSED');
    expect(breaker.getState().hourlySpendCents).toBe(900);
  });

  it('ignores non-positive charges (defensive)', () => {
    const { breaker } = makeBreaker();
    breaker.recordCharge(0);
    breaker.recordCharge(-50);
    breaker.recordCharge(Number.NaN);
    breaker.recordCharge(Number.POSITIVE_INFINITY);
    expect(breaker.state).toBe('CLOSED');
    expect(breaker.getState().hourlySpendCents).toBe(0);
  });
});

describe('LlmCostCircuitBreaker — trip on hourly spike', () => {
  it('trips OPEN when hourly spend exceeds the threshold', () => {
    const { breaker } = makeBreaker();
    breaker.recordCharge(1_001); // > $10 hourly threshold
    expect(breaker.state).toBe('OPEN');
    expect(breaker.canAttempt()).toBe(false);
  });

  it('keeps the breaker OPEN while still within the cooldown', () => {
    const { breaker, tick } = makeBreaker();
    breaker.recordCharge(1_500);
    expect(breaker.state).toBe('OPEN');
    tick(30_000); // half of 60s cooldown
    expect(breaker.state).toBe('OPEN');
  });
});

describe('LlmCostCircuitBreaker — trip on daily cap', () => {
  it('trips OPEN when daily spend exceeds dailyBudgetCents (independent of hourly)', () => {
    const { breaker, tick } = makeBreaker({
      hourlyThresholdCents: 100_000, // huge — hourly cap can NOT trigger
      dailyBudgetCents: 800,
      openDurationMs: 60_000,
    });
    // Spread spend across two hours so the hourly window won't catch it.
    breaker.recordCharge(400);
    tick(70 * 60_000); // jump 70 min — prunes the first charge from hourly window
    breaker.recordCharge(500); // daily total = 900 > 800 cap
    expect(breaker.state).toBe('OPEN');
  });
});

describe('LlmCostCircuitBreaker — HALF_OPEN transitions', () => {
  it('OPEN → HALF_OPEN after openDurationMs elapses', () => {
    const { breaker, tick } = makeBreaker();
    breaker.recordCharge(1_500);
    expect(breaker.state).toBe('OPEN');

    tick(60_000);
    expect(breaker.state).toBe('HALF_OPEN');
  });

  it('HALF_OPEN admits exactly ONE probe (slot is consumed synchronously)', () => {
    const { breaker, tick } = makeBreaker();
    breaker.recordCharge(1_500);
    tick(60_000); // becomes HALF_OPEN
    expect(breaker.state).toBe('HALF_OPEN');

    expect(breaker.canAttempt()).toBe(true); // probe slot taken
    expect(breaker.canAttempt()).toBe(false); // concurrent caller rejected
  });

  it('HALF_OPEN probe success → CLOSED', () => {
    // Use a tiny daily window so the previous trip charge does not survive
    // the recovery — we recordCharge() a small post-cooldown amount to
    // simulate a healthy probe.
    const { breaker, tick } = makeBreaker({
      hourlyThresholdCents: 1_000,
      dailyBudgetCents: 100_000,
      openDurationMs: 60_000,
    });
    breaker.recordCharge(1_500); // OPEN
    tick(60 * 60_000 + 1); // jump > 1h: hourly window prunes the spike too
    expect(breaker.state).toBe('HALF_OPEN');
    expect(breaker.canAttempt()).toBe(true);

    breaker.recordCharge(50); // small healthy charge
    expect(breaker.state).toBe('CLOSED');
  });

  it('HALF_OPEN probe fail (recordFailure) → re-OPEN', () => {
    const { breaker, tick } = makeBreaker();
    breaker.recordCharge(1_500);
    tick(60_000);
    expect(breaker.state).toBe('HALF_OPEN');
    expect(breaker.canAttempt()).toBe(true);

    breaker.recordFailure();
    expect(breaker.state).toBe('OPEN');
  });

  it('HALF_OPEN probe that itself breaches the cap → re-OPEN', () => {
    const { breaker, tick } = makeBreaker();
    breaker.recordCharge(1_500);
    tick(60 * 60_000 + 1); // prune hourly window
    expect(breaker.state).toBe('HALF_OPEN');

    breaker.recordCharge(1_200); // > 1000 hourly threshold → trip again
    expect(breaker.state).toBe('OPEN');
  });
});

describe('LlmCostCircuitBreaker — observability + reset', () => {
  it('onStateChange fires for every transition (CLOSED → OPEN → HALF_OPEN → CLOSED)', () => {
    const transitions: [string, string][] = [];
    const { breaker, tick } = makeBreaker({
      hourlyThresholdCents: 1_000,
      dailyBudgetCents: 100_000,
      openDurationMs: 60_000,
      onStateChange: (next, prev) => transitions.push([prev, next]),
    });
    breaker.recordCharge(1_500);
    tick(60 * 60_000 + 1);
    void breaker.state; // triggers lazy OPEN→HALF_OPEN
    breaker.recordCharge(50);

    expect(transitions).toEqual([
      ['CLOSED', 'OPEN'],
      ['OPEN', 'HALF_OPEN'],
      ['HALF_OPEN', 'CLOSED'],
    ]);
  });

  it('reset() restores CLOSED + clears spend + fires onStateChange exactly once', () => {
    const transitions: [string, string][] = [];
    const { breaker } = makeBreaker({
      onStateChange: (next, prev) => transitions.push([prev, next]),
    });
    breaker.recordCharge(1_500);
    expect(breaker.state).toBe('OPEN');

    transitions.length = 0; // discard the CLOSED→OPEN observation
    breaker.reset();
    expect(breaker.state).toBe('CLOSED');
    expect(breaker.getState().hourlySpendCents).toBe(0);
    expect(transitions).toEqual([['OPEN', 'CLOSED']]);
  });

  it('getState() returns a stable snapshot for /api/health', () => {
    const { breaker } = makeBreaker();
    breaker.recordCharge(500);
    const snapshot = breaker.getState();
    expect(snapshot.state).toBe('CLOSED');
    expect(snapshot.hourlySpendCents).toBe(500);
    expect(snapshot.dailySpendCents).toBe(500);
    expect(snapshot.lastTripAt).toBeNull();
  });
});
