/**
 * TR-01 — Pure network-quality engine (run undefined-network-detection-reliability,
 * cluster A, task A-R1). Pins design §2.1 transition semantics: hysteresis
 * 1400/1000 ms, 5-sample minimum, 3-failures-of-last-5, uniform 30 s dwell
 * ok↔slow, 60 s half-life recency weighting, 20-sample buffer, 5 min staleness.
 *
 * Invariants frozen here: INV-06 (pure + deterministic, injected clock),
 * INV-07 (numeric hysteresis), INV-08 (window < 5 ⇒ unknown, never low by
 * measurement without data), INV-10 (bounded memory + identity reset).
 */
import {
  addQualitySample,
  evictStaleSamples,
  initialQualityEngineState,
  resetQualityEngine,
  weightedMedianRtt,
  QUALITY_ENTER_RTT_MS,
  QUALITY_EXIT_RTT_MS,
  QUALITY_MIN_SAMPLES,
  QUALITY_FAIL_THRESHOLD,
  QUALITY_FAIL_WINDOW,
  QUALITY_DWELL_MS,
  QUALITY_HALF_LIFE_MS,
  QUALITY_BUFFER_MAX,
  QUALITY_STALE_MS,
  type QualityEngineState,
} from '@/shared/infrastructure/connectivity/networkQuality';
import {
  makeQualitySample,
  makeQualityWindow,
  type QualitySample,
} from '@/__tests__/helpers/factories/connectivity.factories';

// ── Sequence helpers (samples always built via the DRY factory) ─────────────

const fastOkAt = (atMs: number): QualitySample => makeQualitySample({ atMs });

const okAt = (atMs: number, rttMs: number): QualitySample => makeQualitySample({ atMs, rttMs });

const timeoutAt = (atMs: number): QualitySample =>
  makeQualitySample({ atMs, rttMs: 15000, ok: false, timedOut: true });

/** Network error without response (US-03.2) — a failure that is NOT a timeout. */
const netFailAt = (atMs: number): QualitySample =>
  makeQualitySample({ atMs, rttMs: 0, ok: false, timedOut: false });

const feed = (state: QualityEngineState, samples: readonly QualitySample[]): QualityEngineState =>
  samples.reduce((s, sample) => addQualitySample(s, sample), state);

/** unknown → slow at t=4000 via 5 ok samples at 1800 ms (clean median build). */
const buildSlowByMedian = (): QualityEngineState =>
  feed(
    initialQualityEngineState(0),
    makeQualityWindow(5, () => ({ rttMs: 1800 })),
  );

describe('networkQuality — constants (INV-07 / NFR-06 / D-10)', () => {
  it('pins the named hysteresis constants to their decided values', () => {
    expect(QUALITY_ENTER_RTT_MS).toBe(1400);
    expect(QUALITY_EXIT_RTT_MS).toBe(1000);
    expect(QUALITY_MIN_SAMPLES).toBe(5);
    expect(QUALITY_FAIL_THRESHOLD).toBe(3);
    expect(QUALITY_FAIL_WINDOW).toBe(5);
    expect(QUALITY_DWELL_MS).toBe(30_000);
    expect(QUALITY_HALF_LIFE_MS).toBe(60_000);
    expect(QUALITY_BUFFER_MAX).toBe(20);
    expect(QUALITY_STALE_MS).toBe(5 * 60_000);
  });
});

describe('networkQuality — initial state', () => {
  it('starts unknown with an empty window anchored at the injected clock (INV-06)', () => {
    const state = initialQualityEngineState(5000);
    expect(state.state).toBe('unknown');
    expect(state.stateSinceMs).toBe(5000);
    expect(state.samples).toEqual([]);
    expect(state.slowEnteredAtMs).toBeNull();
  });
});

describe('networkQuality — INV-08: fewer than 5 fresh samples ⇒ unknown', () => {
  it('stays unknown after 4 timeouts (never low by measurement without enough data)', () => {
    const state = feed(
      initialQualityEngineState(0),
      makeQualityWindow(4, () => ({ rttMs: 15000, ok: false, timedOut: true })),
    );
    expect(state.state).toBe('unknown');
  });

  it('stays unknown after 4 terrible-RTT ok samples', () => {
    const state = feed(
      initialQualityEngineState(0),
      makeQualityWindow(4, () => ({ rttMs: 5000 })),
    );
    expect(state.state).toBe('unknown');
  });

  it('transitions unknown→ok exactly at the 5th fast sample', () => {
    const after4 = feed(initialQualityEngineState(0), makeQualityWindow(4));
    expect(after4.state).toBe('unknown');
    const after5 = addQualitySample(after4, fastOkAt(4000));
    expect(after5.state).toBe('ok');
  });
});

describe('networkQuality — ENTER slow median boundary (INV-07 / US-03.1)', () => {
  it('5 ok samples at exactly 1400 ms ⇒ slow (threshold is ≥)', () => {
    const state = feed(
      initialQualityEngineState(0),
      makeQualityWindow(5, () => ({ rttMs: 1400 })),
    );
    expect(state.state).toBe('slow');
  });

  it('5 ok samples at 1399 ms ⇒ ok (just under the threshold)', () => {
    const state = feed(
      initialQualityEngineState(0),
      makeQualityWindow(5, () => ({ rttMs: 1399 })),
    );
    expect(state.state).toBe('ok');
  });

  it('unknown→slow is direct, with NO dwell wait (spec acceptance #2: slow from boot)', () => {
    // 5 samples within 4 s of boot — far less than the 30 s dwell — must still land slow.
    const state = buildSlowByMedian();
    expect(state.state).toBe('slow');
    expect(state.slowEnteredAtMs).toBe(4000);
  });
});

describe('networkQuality — 3-failures-of-last-5 rule (INV-07 / US-03.2)', () => {
  it('3 timeouts among the last 5 ⇒ slow even when the ok samples are fast', () => {
    // [fail, ok, fail, ok, fail] — ok median is 100 ms but failures dominate.
    const state = feed(initialQualityEngineState(0), [
      timeoutAt(0),
      fastOkAt(1000),
      timeoutAt(2000),
      fastOkAt(3000),
      timeoutAt(4000),
    ]);
    expect(state.state).toBe('slow');
  });

  it('3 network errors WITHOUT response (non-timeout failures) also count (US-03.2)', () => {
    const state = feed(initialQualityEngineState(0), [
      netFailAt(0),
      netFailAt(1000),
      netFailAt(2000),
      fastOkAt(3000),
      fastOkAt(4000),
    ]);
    expect(state.state).toBe('slow');
  });

  it('2 failures among the last 5 ⇒ not slow', () => {
    const state = feed(initialQualityEngineState(0), [
      timeoutAt(0),
      timeoutAt(1000),
      fastOkAt(2000),
      fastOkAt(3000),
      fastOkAt(4000),
    ]);
    expect(state.state).toBe('ok');
  });

  it('counts failures over the LAST 5 samples, not the whole buffer', () => {
    // Whole window holds 3 failures, but the last 5 = [f, ok, ok, ok, f] = 2 failures.
    const state = feed(initialQualityEngineState(0), [
      timeoutAt(0),
      timeoutAt(1000),
      fastOkAt(2000),
      fastOkAt(3000),
      fastOkAt(4000),
      timeoutAt(5000),
    ]);
    expect(state.state).toBe('ok');
  });
});

describe('networkQuality — dwell ok→slow (INV-07 / US-04.2)', () => {
  /** ok at t=4000 via 5 fast samples, then failures pushing toward slow. */
  const okThenFailures = (): QualityEngineState =>
    feed(initialQualityEngineState(0), [
      ...makeQualityWindow(5),
      timeoutAt(10_000),
      timeoutAt(11_000),
      timeoutAt(12_000),
    ]);

  it('ENTER condition met 8 s after entering ok ⇒ stays ok (dwell 30 s not elapsed)', () => {
    const state = okThenFailures();
    // last 5 at t=12 s = [ok@3s, ok@4s, f, f, f] → ENTER met, but 12s-4s < 30s.
    expect(state.state).toBe('ok');
  });

  it('transitions ok→slow once exactly 30 s have elapsed in ok (dwell is ≥)', () => {
    // stateSinceMs = 4000 (entered ok) ; failure at 34 000 ⇒ 30 000 elapsed exactly.
    const state = addQualitySample(okThenFailures(), timeoutAt(34_000));
    expect(state.state).toBe('slow');
    expect(state.slowEnteredAtMs).toBe(34_000);
  });

  it('never produces ok→slow→ok within 30 s (US-04.2)', () => {
    const slow = addQualitySample(okThenFailures(), timeoutAt(34_000));
    // 5 fast post-entry samples 1-5 s after entering slow: exit median/timeout
    // conditions are all met, but the dwell blocks the inverse transition.
    const after = feed(
      slow,
      [35_000, 36_000, 37_000, 38_000, 39_000].map((t) => fastOkAt(t)),
    );
    expect(after.state).toBe('slow');
    // One more fast sample at exactly slow-entry + 30 s ⇒ recovery allowed.
    const recovered = addQualitySample(after, fastOkAt(64_000));
    expect(recovered.state).toBe('ok');
  });
});

describe('networkQuality — EXIT slow (INV-07 / US-04.1)', () => {
  it('5 post-entry samples at exactly 1000 ms + dwell elapsed ⇒ ok (threshold is ≤)', () => {
    const state = feed(
      buildSlowByMedian(),
      [40_000, 41_000, 42_000, 43_000, 44_000].map((t) => okAt(t, 1000)),
    );
    expect(state.state).toBe('ok');
  });

  it('5 post-entry samples at 1001 ms ⇒ stays slow (hysteresis band 1000-1400)', () => {
    const state = feed(
      buildSlowByMedian(),
      [40_000, 41_000, 42_000, 43_000, 44_000].map((t) => okAt(t, 1001)),
    );
    expect(state.state).toBe('slow');
  });

  it('requires ≥5 samples POSTERIOR to slow entry — pre-entry samples never count', () => {
    // 4 fast post-entry samples: a whole-window weighted median would already
    // be fast (4×100 fresh outweighs 5×1800 aged), but exit needs 5 post-entry.
    const after4 = feed(
      buildSlowByMedian(),
      [40_000, 41_000, 42_000, 43_000].map((t) => fastOkAt(t)),
    );
    expect(after4.state).toBe('slow');
    const after5 = addQualitySample(after4, fastOkAt(44_000));
    expect(after5.state).toBe('ok');
  });

  it('a timeout among the post-entry samples blocks the exit (US-04.1)', () => {
    const state = feed(buildSlowByMedian(), [
      fastOkAt(40_000),
      fastOkAt(41_000),
      timeoutAt(42_000),
      fastOkAt(43_000),
      fastOkAt(44_000),
    ]);
    expect(state.state).toBe('slow');
  });

  it('a non-timeout network failure does NOT block the exit (US-04.1 pins timeouts only)', () => {
    const state = feed(buildSlowByMedian(), [
      fastOkAt(40_000),
      fastOkAt(41_000),
      netFailAt(42_000),
      fastOkAt(43_000),
      fastOkAt(44_000),
      fastOkAt(45_000),
    ]);
    expect(state.state).toBe('ok');
  });
});

describe('networkQuality — staleness eviction (US-10.4 / INV-10)', () => {
  it('evictStaleSamples drops everything older than 5 min and falls back to unknown', () => {
    const slow = buildSlowByMedian();
    const state = evictStaleSamples(slow, 4000 + QUALITY_STALE_MS + 1);
    expect(state.state).toBe('unknown');
    expect(state.samples).toEqual([]);
  });

  it('partial eviction below 5 fresh samples falls back to unknown, keeping fresh ones', () => {
    const ok = feed(initialQualityEngineState(0), makeQualityWindow(5));
    // now = 300 500 : sample@0 is stale (age 300 500 > 5 min), samples@1000+ are fresh.
    const state = evictStaleSamples(ok, QUALITY_STALE_MS + 500);
    expect(state.state).toBe('unknown');
    expect(state.samples).toHaveLength(4);
  });

  it('addQualitySample also evicts stale samples (window judged at sample.atMs)', () => {
    const ok = feed(initialQualityEngineState(0), makeQualityWindow(5));
    const state = addQualitySample(ok, fastOkAt(600_000));
    expect(state.state).toBe('unknown');
    expect(state.samples).toHaveLength(1);
  });
});

describe('networkQuality — bounded memory (INV-10)', () => {
  it('caps the buffer at 20 samples, dropping the oldest', () => {
    const state = feed(initialQualityEngineState(0), makeQualityWindow(25));
    expect(state.samples).toHaveLength(QUALITY_BUFFER_MAX);
    expect(state.samples[0]?.atMs).toBe(5000);
  });
});

describe('networkQuality — reset (US-04.3)', () => {
  it('resetQualityEngine returns a pristine unknown state anchored at the injected clock', () => {
    const slow = buildSlowByMedian();
    expect(slow.state).toBe('slow');
    const state = resetQualityEngine(99_000);
    expect(state.state).toBe('unknown');
    expect(state.samples).toEqual([]);
    expect(state.slowEnteredAtMs).toBeNull();
    expect(state.stateSinceMs).toBe(99_000);
  });
});

describe('networkQuality — weightedMedianRtt (INV-07 half-life / design §2.1)', () => {
  it('returns null on an empty window', () => {
    expect(weightedMedianRtt([], 0)).toBeNull();
  });

  it('returns null when every sample is a failure (no interpretable RTT)', () => {
    const samples = makeQualityWindow(3, () => ({ rttMs: 15000, ok: false, timedOut: true }));
    expect(weightedMedianRtt(samples, 2000)).toBeNull();
  });

  it('ignores failed samples — median over ok samples only', () => {
    const samples = [
      fastOkAt(0),
      makeQualitySample({ atMs: 0, rttMs: 9999, ok: false, timedOut: true }),
    ];
    expect(weightedMedianRtt(samples, 0)).toBe(100);
  });

  it('weights by recency with a 60 s half-life: 2 fresh fast samples outweigh 3 stale slow ones', () => {
    // 3×2000 ms aged 120 s (weight 0.25 each = 0.75) vs 2×100 ms fresh (weight 1 each = 2).
    const samples = [
      okAt(0, 2000),
      okAt(0, 2000),
      okAt(0, 2000),
      okAt(120_000, 100),
      okAt(120_000, 100),
    ];
    expect(weightedMedianRtt(samples, 120_000)).toBe(100);
  });

  it('reduces to the plain median at equal weights (odd count)', () => {
    const samples = [okAt(1000, 100), okAt(1000, 300), okAt(1000, 200)];
    expect(weightedMedianRtt(samples, 1000)).toBe(200);
  });
});

describe('networkQuality — recency weighting inside the engine decision', () => {
  it('fresh fast traffic outweighs old slow samples: no false ENTER (INV-07 half-life)', () => {
    // 3 stale 5000 ms samples (age ~180 s ⇒ weight 0.125) + 2 fresh 100 ms ones.
    // An unweighted median would read 5000 ⇒ slow; the weighted one reads 100 ⇒ ok.
    const state = feed(initialQualityEngineState(0), [
      okAt(0, 5000),
      okAt(1000, 5000),
      okAt(2000, 5000),
      okAt(180_000, 100),
      okAt(180_500, 100),
    ]);
    expect(state.state).toBe('ok');
  });
});

describe('networkQuality — determinism & purity (INV-06)', () => {
  it('same inputs produce deep-equal outputs on a double run', () => {
    const run = (): QualityEngineState => {
      const fed = feed(
        initialQualityEngineState(0),
        makeQualityWindow(7, (i) => ({
          rttMs: 1500,
          ok: i % 3 !== 0,
          timedOut: i % 3 === 0,
        })),
      );
      return evictStaleSamples(fed, 10_000);
    };
    expect(run()).toEqual(run());
  });

  it('addQualitySample does not mutate its input state', () => {
    const s0 = feed(initialQualityEngineState(0), makeQualityWindow(3));
    const snapshot = JSON.parse(JSON.stringify(s0)) as unknown;
    addQualitySample(s0, fastOkAt(3000));
    expect(s0).toEqual(snapshot);
  });
});
