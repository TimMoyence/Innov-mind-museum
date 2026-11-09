import { LlmCostCircuitBreaker } from '@modules/chat/adapters/secondary/llm/llm-cost-circuit-breaker';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

function makeBreaker(overrides: ConstructorParameters<typeof LlmCostCircuitBreaker>[0] = {}): {
  breaker: LlmCostCircuitBreaker;
  tick: (deltaMs: number) => void;
} {
  let cursor = new Date('2026-05-13T10:00:00Z').getTime();
  const breaker = new LlmCostCircuitBreaker({
    hourlyThresholdCents: 1_000,
    dailyBudgetCents: 5_000,
    openDurationMs: 60_000,
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
      breaker.recordCharge(100);
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
    breaker.recordCharge(1_001);
    expect(breaker.state).toBe('OPEN');
    expect(breaker.canAttempt()).toBe(false);
  });

  it('keeps the breaker OPEN while still within the cooldown', () => {
    const { breaker, tick } = makeBreaker();
    breaker.recordCharge(1_500);
    expect(breaker.state).toBe('OPEN');
    tick(30_000);
    expect(breaker.state).toBe('OPEN');
  });
});

describe('LlmCostCircuitBreaker — trip on daily cap', () => {
  it('trips OPEN when daily spend exceeds dailyBudgetCents (independent of hourly)', () => {
    const { breaker, tick } = makeBreaker({
      hourlyThresholdCents: 100_000,
      dailyBudgetCents: 800,
      openDurationMs: 60_000,
    });
    breaker.recordCharge(400);
    tick(70 * 60_000);
    breaker.recordCharge(500);
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
    tick(60_000);
    expect(breaker.state).toBe('HALF_OPEN');

    expect(breaker.canAttempt()).toBe(true);
    expect(breaker.canAttempt()).toBe(false);
  });

  it('HALF_OPEN probe success → CLOSED', () => {
    const { breaker, tick } = makeBreaker({
      hourlyThresholdCents: 1_000,
      dailyBudgetCents: 100_000,
      openDurationMs: 60_000,
    });
    breaker.recordCharge(1_500);
    tick(60 * 60_000 + 1);
    expect(breaker.state).toBe('HALF_OPEN');
    expect(breaker.canAttempt()).toBe(true);

    breaker.recordCharge(50);
    expect(breaker.state).toBe('CLOSED');
  });

  it('trip → HALF_OPEN → probe success → CLOSED but PRESERVES dailySpendCents (W1-C1 money regression)', () => {
    const { breaker, tick } = makeBreaker({
      hourlyThresholdCents: 1_000,
      dailyBudgetCents: 1_000_000,
      openDurationMs: 60_000,
    });

    breaker.recordCharge(300);
    tick(61 * 60_000);
    breaker.recordCharge(300);
    tick(61 * 60_000);
    expect(breaker.getState().dailySpendCents).toBe(600);

    breaker.recordCharge(1_500);
    expect(breaker.state).toBe('OPEN');
    expect(breaker.getState().dailySpendCents).toBe(2_100);

    tick(61 * 60_000);
    expect(breaker.state).toBe('HALF_OPEN');
    expect(breaker.canAttempt()).toBe(true);

    breaker.recordCharge(50);
    expect(breaker.state).toBe('CLOSED');

    expect(breaker.getState().dailySpendCents).toBeGreaterThan(0);
    expect(breaker.getState().dailySpendCents).toBe(2_150);
    expect(breaker.getState().hourlySpendCents).toBe(50);
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
    tick(60 * 60_000 + 1);
    expect(breaker.state).toBe('HALF_OPEN');

    breaker.recordCharge(1_200);
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
    void breaker.state;
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

    transitions.length = 0;
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
