/**
 * UFR-022 RED phase — TD-67 HALF_OPEN probe-slot lock-out regression.
 * RUN_ID: TD-67+68 (circuit-breaker probe leak).
 *
 * Bug (TD-67): `canAttempt()` decrements `availableProbes` when it admits a
 * HALF_OPEN probe (three-state-circuit.ts:133-134). The slot is ONLY restored by
 * `recordOutcome('success')` (→ CLOSED), `recordOutcome('failure')` (→ trip), or
 * the manual `reset()`. If the caller throws between `canAttempt()` returning
 * `true` and `recordOutcome()` being reached, the probe is consumed but never
 * recorded → the slot is never returned. With the default `halfOpenMaxProbes=1`
 * the circuit then sits in HALF_OPEN forever: `openedAtMs` was cleared on the
 * OPEN→HALF_OPEN transition (line 110) so the `state` getter never re-runs the
 * OPEN cooldown, and every subsequent `canAttempt()` short-circuits to `false`
 * at line 133 → permanent lock-out, no recovery.
 *
 * FIX (green): expose a `releaseProbe()` primitive that returns an un-recorded
 * outstanding HALF_OPEN probe to the pool (capped at `halfOpenMaxProbes`,
 * NO over-release), so callers can wrap `canAttempt`/`recordOutcome` in
 * try/finally and recover the slot on exception. Must remain NO-I/O / NO-logging
 * (primitive purity contract, three-state-circuit.ts:16-18 + pr13 purity sentinel).
 *
 * Pre-green failure mode: `releaseProbe` does not exist on `ThreeStateCircuit`
 * → TypeScript compile error `Property 'releaseProbe' does not exist` AND the
 * behavioral assertion (slot recovered) cannot hold. Counts as RED.
 *
 * Frozen-test discipline (UFR-022): this file will be sha256-hashed in
 * red-test-manifest.json. Green phase MUST NOT modify it.
 */
import {
  ThreeStateCircuit,
  type CircuitTripStrategy,
} from '@shared/circuit-breaker/three-state-circuit';

/** Minimal in-test trip strategy driven by a public boolean flag. */
class MockTripStrategy implements CircuitTripStrategy {
  public tripFlag = false;

  shouldTrip(): boolean {
    return this.tripFlag;
  }

  pruneExpired(): void {
    /* no-op */
  }

  reset(): void {
    /* no-op */
  }

  resetTransient(): void {
    /* no-op */
  }
}

/**
 * Mutable virtual clock for deterministic tests.
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

/**
 * Build a circuit and drive it into HALF_OPEN (single probe by default).
 * @param halfOpenMaxProbes
 */
function makeHalfOpenCircuit(halfOpenMaxProbes?: number): {
  circuit: ThreeStateCircuit<MockTripStrategy>;
  clock: ReturnType<typeof makeClock>;
  strategy: MockTripStrategy;
} {
  const strategy = new MockTripStrategy();
  const clock = makeClock();
  const circuit = new ThreeStateCircuit({
    strategy,
    openDurationMs: 1_000,
    ...(halfOpenMaxProbes !== undefined ? { halfOpenMaxProbes } : {}),
    now: clock.now,
  });

  strategy.tripFlag = true;
  circuit.recordOutcome('failure');
  expect(circuit.state).toBe('OPEN');
  strategy.tripFlag = false;
  clock.advance(1_000);
  expect(circuit.state).toBe('HALF_OPEN');

  return { circuit, clock, strategy };
}

describe('ThreeStateCircuit — TD-67 HALF_OPEN probe-slot release', () => {
  it('does NOT lock out permanently when a probe is consumed but never recorded (caller threw)', () => {
    const { circuit } = makeHalfOpenCircuit();

    // Caller admits a probe...
    expect(circuit.canAttempt()).toBe(true);
    // ...then throws BEFORE reaching recordOutcome — simulate by skipping it.
    // Today the slot is gone: the single probe was consumed and never restored.
    expect(circuit.canAttempt()).toBe(false);

    // RECOVERY PATH (the fix): releasing the outstanding probe must return the
    // slot so a retry is possible. Pre-green this method does not exist → RED.
    circuit.releaseProbe();

    expect(circuit.state).toBe('HALF_OPEN');
    expect(circuit.canAttempt()).toBe(true);
  });

  it('releaseProbe() restores exactly one slot and never over-releases past the cap (halfOpenMaxProbes=2)', () => {
    const { circuit } = makeHalfOpenCircuit(2);

    // Consume both probes.
    expect(circuit.canAttempt()).toBe(true);
    expect(circuit.canAttempt()).toBe(true);
    expect(circuit.canAttempt()).toBe(false);

    // Release one outstanding probe → exactly one slot back.
    circuit.releaseProbe();
    expect(circuit.canAttempt()).toBe(true);
    expect(circuit.canAttempt()).toBe(false);

    // Over-release guard: more releases than outstanding probes must NOT inflate
    // the pool beyond the configured cap.
    circuit.releaseProbe();
    circuit.releaseProbe();
    circuit.releaseProbe();
    expect(circuit.canAttempt()).toBe(true); // exactly the 1 genuinely outstanding slot
    expect(circuit.canAttempt()).toBe(false);
  });

  it('releaseProbe() is a harmless no-op in CLOSED', () => {
    const strategy = new MockTripStrategy();
    const clock = makeClock();
    const circuit = new ThreeStateCircuit({
      strategy,
      openDurationMs: 1_000,
      now: clock.now,
    });

    expect(circuit.state).toBe('CLOSED');
    circuit.releaseProbe();
    expect(circuit.state).toBe('CLOSED');
    expect(circuit.canAttempt()).toBe(true);
  });

  it('releaseProbe() is a harmless no-op in OPEN', () => {
    const strategy = new MockTripStrategy();
    const clock = makeClock();
    const circuit = new ThreeStateCircuit({
      strategy,
      openDurationMs: 10_000,
      now: clock.now,
    });

    strategy.tripFlag = true;
    circuit.recordOutcome('failure');
    expect(circuit.state).toBe('OPEN');

    circuit.releaseProbe();
    expect(circuit.state).toBe('OPEN');
    expect(circuit.canAttempt()).toBe(false);
  });
});
