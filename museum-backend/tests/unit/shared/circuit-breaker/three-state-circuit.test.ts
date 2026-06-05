/**
 * UFR-022 red phase — PR-13 `ThreeStateCircuit<TStrategy>` primitive unit tests.
 * RUN_ID: 2026-05-23-pr-13-threeStateCircuit.
 *
 * Tests the generic 3-state FSM primitive in ISOLATION using a local mock
 * `CircuitTripStrategy`. The primitive does NOT exist yet — these tests fail
 * with a `Cannot find module '@shared/circuit-breaker/three-state-circuit'`
 * compile/resolve error pre-green (counts as RED).
 *
 * Pre-green failure mode: module not found.
 * Post-green expected: 9 cases pass (see design.md §6.1).
 *
 * Spec sources of truth:
 *   .claude/skills/team/team-state/2026-05-23-pr-13-threeStateCircuit/spec.md §7 R1 / §8 NFR-1..6
 *   .claude/skills/team/team-state/2026-05-23-pr-13-threeStateCircuit/design.md §3.1 / §3.3 / §3.4 / §3.5
 *   .claude/skills/team/team-state/2026-05-23-pr-13-threeStateCircuit/tasks.md T1 / T7.a
 *
 * Frozen-test discipline (UFR-022): this file is sha256-hashed in
 * red-test-manifest.json. Green phase MUST NOT modify it. Suspected bug →
 * emit `BLOCK-TEST-WRONG <file>:<line> <reason>` and STOP.
 */
import {
  ThreeStateCircuit,
  type CircuitState,
  type CircuitTripStrategy,
} from '@shared/circuit-breaker/three-state-circuit';

/**
 * Minimal in-test trip strategy. Drives `shouldTrip` via a public boolean flag
 * controlled by the test. Counts `reset()` / `pruneExpired()` invocations so
 * tests can assert the primitive's delegate calls.
 */
class MockTripStrategy implements CircuitTripStrategy {
  public tripFlag = false;
  public resetCount = 0;
  // W1-C1 RED (run 2026-05-26-kr-domains): probe-success must call the new
  // transient-only reset, NOT the full `reset()`. Counted separately so the
  // primitive's delegate choice is asserted exactly.
  public resetTransientCount = 0;
  public pruneCount = 0;
  public lastShouldTripNow: number | null = null;
  public lastPruneNow: number | null = null;

  shouldTrip(now: number): boolean {
    this.lastShouldTripNow = now;
    return this.tripFlag;
  }

  pruneExpired(now: number): void {
    this.lastPruneNow = now;
    this.pruneCount += 1;
  }

  reset(): void {
    this.resetCount += 1;
  }

  resetTransient(): void {
    this.resetTransientCount += 1;
  }
}

/**
 * Mutable virtual clock helper for deterministic tests (no jest fake timers).
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

describe('ThreeStateCircuit<TStrategy> — primitive 3-state FSM', () => {
  it('CLOSED → OPEN when recordOutcome("failure") and strategy.shouldTrip returns true', () => {
    const strategy = new MockTripStrategy();
    const clock = makeClock();
    const circuit = new ThreeStateCircuit({
      strategy,
      openDurationMs: 30_000,
      now: clock.now,
    });

    expect(circuit.state).toBe('CLOSED');

    strategy.tripFlag = true;
    circuit.recordOutcome('failure');

    expect(circuit.state).toBe('OPEN');
    expect(circuit.openedAt).toBe(clock.now());
  });

  it('OPEN → HALF_OPEN lazy on `state` getter after openDurationMs elapsed', () => {
    const strategy = new MockTripStrategy();
    const clock = makeClock();
    const events: [CircuitState, CircuitState][] = [];
    const circuit = new ThreeStateCircuit({
      strategy,
      openDurationMs: 30_000,
      now: clock.now,
      onStateChange: (next, prev) => events.push([next, prev]),
    });

    strategy.tripFlag = true;
    circuit.recordOutcome('failure');
    expect(circuit.state).toBe('OPEN');

    clock.advance(29_999);
    expect(circuit.state).toBe('OPEN'); // not yet elapsed

    clock.advance(2);
    expect(circuit.state).toBe('HALF_OPEN'); // lazy transition
    expect(events).toContainEqual(['HALF_OPEN', 'OPEN']);
    expect(circuit.halfOpenedAt).toBe(clock.now());
  });

  it('HALF_OPEN + success → CLOSED, strategy.resetTransient called (NOT reset), onStateChange fired', () => {
    // W1-C1 RED (run 2026-05-26-kr-domains): on probe success the primitive must
    // call `strategy.resetTransient()` — clearing only the transient spike window
    // — NOT the full `strategy.reset()`, which would wipe durable accumulators
    // (the daily cost cap in CostTripStrategy). Asserting the delegate choice here
    // keeps the cost-money invariant (AC-C1.1) at the primitive boundary.
    //
    // RED failure mode at be758ab56: `MockTripStrategy.resetTransient` does not
    // satisfy the (not-yet-extended) interface AND the primitive still calls
    // `reset()` on success → `resetTransientCount` stays 0 while `resetCount`
    // increments. The assertions below invert that → FAIL. Counts as RED.
    const strategy = new MockTripStrategy();
    const clock = makeClock();
    const events: [CircuitState, CircuitState][] = [];
    const circuit = new ThreeStateCircuit({
      strategy,
      openDurationMs: 1_000,
      now: clock.now,
      onStateChange: (next, prev) => events.push([next, prev]),
    });

    strategy.tripFlag = true;
    circuit.recordOutcome('failure');
    strategy.tripFlag = false;
    clock.advance(1_000);
    expect(circuit.state).toBe('HALF_OPEN');

    const resetBefore = strategy.resetCount;
    const resetTransientBefore = strategy.resetTransientCount;
    circuit.recordOutcome('success');

    expect(circuit.state).toBe('CLOSED');
    // Probe success → transient-only reset, full reset NOT invoked.
    expect(strategy.resetTransientCount).toBe(resetTransientBefore + 1);
    expect(strategy.resetCount).toBe(resetBefore);
    expect(events).toContainEqual(['CLOSED', 'HALF_OPEN']);
  });

  it('HALF_OPEN + failure → OPEN (re-trip), onStateChange fired with prev=HALF_OPEN', () => {
    const strategy = new MockTripStrategy();
    const clock = makeClock();
    const events: [CircuitState, CircuitState][] = [];
    const circuit = new ThreeStateCircuit({
      strategy,
      openDurationMs: 1_000,
      now: clock.now,
      onStateChange: (next, prev) => events.push([next, prev]),
    });

    strategy.tripFlag = true;
    circuit.recordOutcome('failure');
    clock.advance(1_000);
    expect(circuit.state).toBe('HALF_OPEN');

    const eventsBefore = events.length;
    circuit.recordOutcome('failure');

    expect(circuit.state).toBe('OPEN');
    // Re-trip event from HALF_OPEN
    expect(events.slice(eventsBefore)).toContainEqual(['OPEN', 'HALF_OPEN']);
  });

  it('canAttempt() in HALF_OPEN with halfOpenMaxProbes=2 admits 2 then returns false', () => {
    const strategy = new MockTripStrategy();
    const clock = makeClock();
    const circuit = new ThreeStateCircuit({
      strategy,
      openDurationMs: 500,
      halfOpenMaxProbes: 2,
      now: clock.now,
    });

    strategy.tripFlag = true;
    circuit.recordOutcome('failure');
    clock.advance(500);
    expect(circuit.state).toBe('HALF_OPEN');

    expect(circuit.canAttempt()).toBe(true);
    expect(circuit.canAttempt()).toBe(true);
    expect(circuit.canAttempt()).toBe(false);
  });

  it('canAttempt() returns true in CLOSED, false in OPEN', () => {
    const strategy = new MockTripStrategy();
    const clock = makeClock();
    const circuit = new ThreeStateCircuit({
      strategy,
      openDurationMs: 10_000,
      now: clock.now,
    });

    expect(circuit.state).toBe('CLOSED');
    expect(circuit.canAttempt()).toBe(true);

    strategy.tripFlag = true;
    circuit.recordOutcome('failure');
    expect(circuit.state).toBe('OPEN');
    expect(circuit.canAttempt()).toBe(false);
  });

  it('reset() from OPEN fires onStateChange→CLOSED; from CLOSED no onStateChange fire but strategy.reset still called', () => {
    const strategy = new MockTripStrategy();
    const clock = makeClock();
    const events: [CircuitState, CircuitState][] = [];
    const circuit = new ThreeStateCircuit({
      strategy,
      openDurationMs: 10_000,
      now: clock.now,
      onStateChange: (next, prev) => events.push([next, prev]),
    });

    strategy.tripFlag = true;
    circuit.recordOutcome('failure');
    expect(circuit.state).toBe('OPEN');

    const eventsBefore = events.length;
    const resetBefore = strategy.resetCount;
    circuit.reset();

    expect(circuit.state).toBe('CLOSED');
    expect(events.slice(eventsBefore)).toContainEqual(['CLOSED', 'OPEN']);
    expect(strategy.resetCount).toBe(resetBefore + 1);

    // Second reset from CLOSED → strategy.reset still called, no new onStateChange event.
    const eventsBefore2 = events.length;
    const resetBefore2 = strategy.resetCount;
    circuit.reset();
    expect(events.length).toBe(eventsBefore2); // no new event
    expect(strategy.resetCount).toBe(resetBefore2 + 1);
  });

  it('public trip() drives OPEN from CLOSED, fires onStateChange, sets openedAt and lastTripAt', () => {
    const strategy = new MockTripStrategy();
    const clock = makeClock();
    const events: [CircuitState, CircuitState][] = [];
    const circuit = new ThreeStateCircuit({
      strategy,
      openDurationMs: 10_000,
      now: clock.now,
      onStateChange: (next, prev) => events.push([next, prev]),
    });

    circuit.trip('CLOSED');

    expect(circuit.state).toBe('OPEN');
    expect(circuit.openedAt).toBe(clock.now());
    expect(circuit.lastTripAt).toBe(clock.now());
    expect(events).toContainEqual(['OPEN', 'CLOSED']);
  });

  it('getCommonSnapshot() reflects { state, openedAt, lastTripAt } accurately across transitions', () => {
    const strategy = new MockTripStrategy();
    const clock = makeClock();
    const circuit = new ThreeStateCircuit({
      strategy,
      openDurationMs: 10_000,
      now: clock.now,
    });

    const snap0 = circuit.getCommonSnapshot();
    expect(snap0.state).toBe('CLOSED');
    expect(snap0.openedAt).toBeNull();
    expect(snap0.lastTripAt).toBeNull();

    const tripTime = clock.now();
    circuit.trip('CLOSED');
    const snap1 = circuit.getCommonSnapshot();
    expect(snap1.state).toBe('OPEN');
    expect(snap1.openedAt).toBeInstanceOf(Date);
    expect(snap1.openedAt?.getTime()).toBe(tripTime);
    expect(snap1.lastTripAt).toBeInstanceOf(Date);
    expect(snap1.lastTripAt?.getTime()).toBe(tripTime);

    circuit.reset();
    const snap2 = circuit.getCommonSnapshot();
    expect(snap2.state).toBe('CLOSED');
    expect(snap2.openedAt).toBeNull();
  });
});
