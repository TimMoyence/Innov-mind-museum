import { LlmCostCircuitBreaker } from '@modules/chat/adapters/secondary/llm/llm-cost-circuit-breaker';
import { logger } from '@shared/logger/logger';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockedLogger = logger as unknown as {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
};

function makeBreaker(overrides: ConstructorParameters<typeof LlmCostCircuitBreaker>[0] = {}): {
  breaker: LlmCostCircuitBreaker;
  tick: (deltaMs: number) => void;
  transitions: [string, string][];
} {
  let cursor = new Date('2026-05-26T10:00:00Z').getTime();
  const transitions: [string, string][] = [];
  const breaker = new LlmCostCircuitBreaker({
    hourlyThresholdCents: 1_000,
    dailyBudgetCents: 5_000,
    openDurationMs: 60_000,
    now: () => cursor,
    onStateChange: (next, prev) => transitions.push([prev, next]),
    ...overrides,
  });
  return {
    breaker,
    tick: (deltaMs: number) => {
      cursor += deltaMs;
    },
    transitions,
  };
}

beforeEach(() => {
  mockedLogger.info.mockClear();
  mockedLogger.warn.mockClear();
  mockedLogger.error.mockClear();
});

describe('LlmCostCircuitBreaker — breaching probe in HALF_OPEN (transition fidelity)', () => {
  it('CASE A — cap-breaching probe → single HALF_OPEN→OPEN, from:half_open, no spurious recovery', () => {
    const { breaker, tick, transitions } = makeBreaker({
      hourlyThresholdCents: 1_000,
      dailyBudgetCents: 100_000,
      openDurationMs: 60_000,
    });
    breaker.recordCharge(1_500);
    expect(breaker.state).toBe('OPEN');

    tick(60 * 60_000 + 1);
    expect(breaker.state).toBe('HALF_OPEN');
    expect(breaker.canAttempt()).toBe(true);

    transitions.length = 0;
    mockedLogger.info.mockClear();
    mockedLogger.warn.mockClear();

    breaker.recordCharge(1_200);

    expect(breaker.state).toBe('OPEN');

    expect(transitions).toEqual([['HALF_OPEN', 'OPEN']]);

    const closeLogs = mockedLogger.info.mock.calls.filter(
      (call: unknown[]) => call[0] === 'llm_cost_circuit_breaker_close',
    );
    expect(closeLogs).toHaveLength(0);

    const openLogs = mockedLogger.warn.mock.calls.filter(
      (call: unknown[]) => call[0] === 'llm_cost_circuit_breaker_open',
    );
    expect(openLogs).toHaveLength(1);
    const openPayload = openLogs[0][1] as { from?: string };
    expect(openPayload.from).toBe('half_open');
  });

  it('CASE B — daily-cap-origin re-trip preserves dailySpend, from:half_open (AC-C1.3 daily origin)', () => {
    const { breaker, tick, transitions } = makeBreaker({
      hourlyThresholdCents: 100_000,
      dailyBudgetCents: 800,
      openDurationMs: 60_000,
    });

    breaker.recordCharge(400);
    tick(70 * 60_000);
    breaker.recordCharge(500);
    expect(breaker.state).toBe('OPEN');
    const dailyAtTrip = breaker.getState().dailySpendCents;
    expect(dailyAtTrip).toBe(900);

    tick(61 * 60_000);
    expect(breaker.state).toBe('HALF_OPEN');
    expect(breaker.canAttempt()).toBe(true);
    expect(breaker.getState().dailySpendCents).toBeGreaterThan(800);

    transitions.length = 0;
    mockedLogger.info.mockClear();
    mockedLogger.warn.mockClear();

    breaker.recordCharge(50);

    expect(breaker.state).toBe('OPEN');

    expect(transitions).toEqual([['HALF_OPEN', 'OPEN']]);

    const closeLogs = mockedLogger.info.mock.calls.filter(
      (call: unknown[]) => call[0] === 'llm_cost_circuit_breaker_close',
    );
    expect(closeLogs).toHaveLength(0);

    const openLogs = mockedLogger.warn.mock.calls.filter(
      (call: unknown[]) => call[0] === 'llm_cost_circuit_breaker_open',
    );
    expect(openLogs).toHaveLength(1);
    expect((openLogs[0][1] as { from?: string }).from).toBe('half_open');

    const dailyAfter = breaker.getState().dailySpendCents;
    expect(dailyAfter).toBeGreaterThan(0);
    expect(dailyAfter).toBeGreaterThanOrEqual(dailyAtTrip);
    expect(dailyAfter).toBe(950);
  });
});
