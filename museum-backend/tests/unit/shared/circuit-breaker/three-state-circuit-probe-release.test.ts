import {
  ThreeStateCircuit,
  type CircuitTripStrategy,
} from '@shared/circuit-breaker/three-state-circuit';

class MockTripStrategy implements CircuitTripStrategy {
  public tripFlag = false;

  shouldTrip(): boolean {
    return this.tripFlag;
  }

  pruneExpired(): void {}

  reset(): void {}

  resetTransient(): void {}
}

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

    expect(circuit.canAttempt()).toBe(true);
    expect(circuit.canAttempt()).toBe(false);

    circuit.releaseProbe();

    expect(circuit.state).toBe('HALF_OPEN');
    expect(circuit.canAttempt()).toBe(true);
  });

  it('releaseProbe() restores exactly one slot and never over-releases past the cap (halfOpenMaxProbes=2)', () => {
    const { circuit } = makeHalfOpenCircuit(2);

    expect(circuit.canAttempt()).toBe(true);
    expect(circuit.canAttempt()).toBe(true);
    expect(circuit.canAttempt()).toBe(false);

    circuit.releaseProbe();
    expect(circuit.canAttempt()).toBe(true);
    expect(circuit.canAttempt()).toBe(false);

    circuit.releaseProbe();
    circuit.releaseProbe();
    circuit.releaseProbe();
    expect(circuit.canAttempt()).toBe(true);
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
