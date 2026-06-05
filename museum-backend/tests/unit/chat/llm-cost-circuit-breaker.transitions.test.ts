/**
 * W1-WAVE1 RED-EXT — transition-fidelity + daily-cap-origin re-trip tests
 * (run 2026-05-26-kr-domains, corrective loop #1 after wave1-code-review.json
 * MEDIUM + LOW findings).
 *
 * These NEW cases close two gaps the reviewer flagged that the 6 existing frozen
 * tests do not pin:
 *
 *   - MEDIUM (llm-cost-circuit-breaker.ts:151-155): on a cap-BREACHING probe in
 *     HALF_OPEN, the reordered recordCharge() recovers FIRST (HALF_OPEN→CLOSED,
 *     emitting an `llm_cost_circuit_breaker_close` "recovery succeeded" info log)
 *     THEN re-trips (CLOSED→OPEN, `from:'closed'`). A breaching probe NEVER
 *     recovered, so this (a) emits a spurious close log and (b) mislabels the
 *     trip origin as 'closed' instead of 'half_open' — polluting the log stream
 *     and any alerting keyed on the `from` label. Correct behaviour = exactly one
 *     HALF_OPEN→OPEN transition, `from:'half_open'`, NO close log.
 *
 *   - LOW (AC-C1.3 daily-origin gap): no test pins "tripped on the DAILY cap →
 *     cooldown → probe arrives, daily STILL over → re-OPEN, dailySpend preserved".
 *     The existing W1-C1 money test (:139) deliberately trips on an HOURLY spike
 *     with an unreachable daily cap, so the daily-origin path is uncovered.
 *
 * Observation mechanism: we capture transitions via the public `onStateChange`
 * option (same seam the existing observability test :224-242 uses) AND spy the
 * logger (mocked) to assert the close/open log fidelity — mirroring the breaker's
 * own log labels (`llm_cost_circuit_breaker_close`, `..._open` with `from`).
 *
 * DAILY-ORIGIN INVARIANT (documented): a breaker tripped on the DAILY cap CANNOT
 * recover to CLOSED before the UTC day rollover — daily spend is durable and a
 * probe charge always keeps it over the cap, so recordCharge MUST re-OPEN. This
 * is correct money behaviour (the daily cap is a hard ceiling for the whole UTC
 * day); CLOSED recovery is reserved for transient hourly-spike trips.
 *
 * RED failure mode at current HEAD: recordCharge's HALF_OPEN branch recovers
 * before re-checking shouldTrip, so a breaching probe produces the
 * HALF_OPEN→CLOSED→OPEN flicker — the transition-sequence assertions and the
 * "no close log" / `from:'half_open'` assertions FAIL. Counts as RED.
 *
 * Frozen-test discipline (UFR-022): this file is sha256-hashed in
 * red-test-manifest.json. Green phase MUST NOT modify it byte-for-byte.
 */
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

/**
 * Breaker bound to a mutable clock cursor. `tick` advances time deterministically
 * (the breaker reads `now()` directly). `transitions` captures every FSM edge via
 * the public `onStateChange` seam.
 * @param overrides
 */
function makeBreaker(overrides: ConstructorParameters<typeof LlmCostCircuitBreaker>[0] = {}): {
  breaker: LlmCostCircuitBreaker;
  tick: (deltaMs: number) => void;
  transitions: [string, string][];
} {
  let cursor = new Date('2026-05-26T10:00:00Z').getTime();
  const transitions: [string, string][] = [];
  const breaker = new LlmCostCircuitBreaker({
    hourlyThresholdCents: 1_000, // $10/h spike
    dailyBudgetCents: 5_000, // $50/day cap
    openDurationMs: 60_000, // 1 min cooldown
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
    // Trip on an hourly spike, cool down + >1h so the spike prunes from the
    // hourly window → HALF_OPEN with a clean window.
    const { breaker, tick, transitions } = makeBreaker({
      hourlyThresholdCents: 1_000,
      dailyBudgetCents: 100_000, // daily can't trip — isolate the hourly breach
      openDurationMs: 60_000,
    });
    breaker.recordCharge(1_500); // CLOSED → OPEN (hourly spike)
    expect(breaker.state).toBe('OPEN');

    tick(60 * 60_000 + 1); // > cooldown AND > 1h: prune the spike, become HALF_OPEN
    expect(breaker.state).toBe('HALF_OPEN');
    expect(breaker.canAttempt()).toBe(true);

    // Discard everything observed up to (and including) the OPEN→HALF_OPEN edge so
    // we assert ONLY the probe's transition(s).
    transitions.length = 0;
    mockedLogger.info.mockClear();
    mockedLogger.warn.mockClear();

    // The probe itself breaches the hourly cap (1_200 > 1_000). It NEVER recovered.
    breaker.recordCharge(1_200);

    // (1) ends OPEN
    expect(breaker.state).toBe('OPEN');

    // (2) exactly ONE transition for the probe: HALF_OPEN → OPEN (no CLOSED flicker)
    expect(transitions).toEqual([['HALF_OPEN', 'OPEN']]);

    // (3) NO spurious "recovery succeeded" close log for this breaching probe
    const closeLogs = mockedLogger.info.mock.calls.filter(
      (call: unknown[]) => call[0] === 'llm_cost_circuit_breaker_close',
    );
    expect(closeLogs).toHaveLength(0);

    // (4) the OPEN log labels the trip origin 'half_open', NOT 'closed'
    const openLogs = mockedLogger.warn.mock.calls.filter(
      (call: unknown[]) => call[0] === 'llm_cost_circuit_breaker_open',
    );
    expect(openLogs).toHaveLength(1);
    const openPayload = openLogs[0][1] as { from?: string };
    expect(openPayload.from).toBe('half_open');
  });

  it('CASE B — daily-cap-origin re-trip preserves dailySpend, from:half_open (AC-C1.3 daily origin)', () => {
    // Trip on the DAILY cap (not hourly): huge hourly threshold so only the daily
    // accumulator can fire. Spread spend across hours so the hourly window never
    // catches it.
    const { breaker, tick, transitions } = makeBreaker({
      hourlyThresholdCents: 100_000, // hourly can NOT trip
      dailyBudgetCents: 800, // small daily cap
      openDurationMs: 60_000,
    });

    breaker.recordCharge(400); // daily = 400 (under cap)
    tick(70 * 60_000); // jump 70 min — prune from hourly window
    breaker.recordCharge(500); // daily = 900 > 800 cap → trip OPEN (daily origin)
    expect(breaker.state).toBe('OPEN');
    const dailyAtTrip = breaker.getState().dailySpendCents;
    expect(dailyAtTrip).toBe(900);

    // Cooldown + >1h so the hourly window is clean → HALF_OPEN. The daily
    // accumulator is durable and still over the cap (same UTC day).
    tick(61 * 60_000);
    expect(breaker.state).toBe('HALF_OPEN');
    expect(breaker.canAttempt()).toBe(true);
    // daily is still over the 800 cap going into the probe
    expect(breaker.getState().dailySpendCents).toBeGreaterThan(800);

    transitions.length = 0;
    mockedLogger.info.mockClear();
    mockedLogger.warn.mockClear();

    // A probe arrives. Daily is ALREADY over cap; any positive charge keeps it
    // over → the breaker MUST re-OPEN, NEVER flicker through CLOSED.
    breaker.recordCharge(50);

    // ends OPEN
    expect(breaker.state).toBe('OPEN');

    // exactly one HALF_OPEN → OPEN edge (no CLOSED recovery)
    expect(transitions).toEqual([['HALF_OPEN', 'OPEN']]);

    // no spurious close log
    const closeLogs = mockedLogger.info.mock.calls.filter(
      (call: unknown[]) => call[0] === 'llm_cost_circuit_breaker_close',
    );
    expect(closeLogs).toHaveLength(0);

    // open log labels origin 'half_open'
    const openLogs = mockedLogger.warn.mock.calls.filter(
      (call: unknown[]) => call[0] === 'llm_cost_circuit_breaker_open',
    );
    expect(openLogs).toHaveLength(1);
    expect((openLogs[0][1] as { from?: string }).from).toBe('half_open');

    // AC-C1.3 (daily origin): the durable daily accumulator survived the probe —
    // preserved (≈ total: 900 + 50 = 950), > 0, NEVER reset to ~0/just-the-probe.
    const dailyAfter = breaker.getState().dailySpendCents;
    expect(dailyAfter).toBeGreaterThan(0);
    expect(dailyAfter).toBeGreaterThanOrEqual(dailyAtTrip); // never wiped below pre-probe daily
    expect(dailyAfter).toBe(950);
  });
});
