/**
 * Pure network-quality engine — QUALITY axis of the three-axis connectivity
 * model (spec §5: availability / cost / quality). Consumes passive RTT/failure
 * samples captured on real axios traffic and reduces them to a
 * {@link QualityState} with hysteresis + dwell anti-flapping (design §2.1).
 *
 * 100 % pure and deterministic (INV-06): no react/netinfo/axios import, zero
 * `Date.now()` / `Math.random()` / timer. The clock is injected — timestamps
 * ride on the samples (`atMs`) and `nowMs` is an explicit argument. Same
 * inputs ⇒ same outputs (TR-01 double-run). The impure shell lives in
 * `networkQualityTracker.ts` (pattern `flapScheduleAt` injected `elapsedMs` /
 * `currentDataMode.ts` singleton+reset).
 */

export type QualityState = 'unknown' | 'ok' | 'slow';

/** Passive sample captured on real HTTP traffic (US-10.1 — never an active probe). */
export interface QualitySample {
  /** Request→response duration in milliseconds. */
  readonly rttMs: number;
  /** `false` = timeout OR network error without a response (US-03.2). A 4xx/5xx response IS ok (design P-05). */
  readonly ok: boolean;
  /** `true` iff the failure was a timeout (`ECONNABORTED`). */
  readonly timedOut: boolean;
  /** Monotone injected timestamp (INV-06 — never stamped inside the engine). */
  readonly atMs: number;
}

export interface QualityEngineState {
  readonly state: QualityState;
  /** Dwell anchor — when the current state was entered (US-04.2). */
  readonly stateSinceMs: number;
  /** Fresh window, ordered by `atMs` ascending, ≤ {@link QUALITY_BUFFER_MAX}. */
  readonly samples: readonly QualitySample[];
  /** When `slow` was entered — EXIT only counts samples strictly after it (US-04.1). */
  readonly slowEnteredAtMs: number | null;
}

// ── NFR-06 — named constants, adjustable without touching the logic (D-10) ──

/** ENTER-slow weighted-median RTT floor — 2G boundary, WICG NetInfo / Chromium `kHttpRtt…2G = 1420 ms`. */
export const QUALITY_ENTER_RTT_MS = 1400;
/** EXIT-slow weighted-median RTT ceiling — ~29 % margin, above the 20 % hysteresis of Facebook connection-class. */
export const QUALITY_EXIT_RTT_MS = 1000;
/** Minimum fresh samples before any verdict — Facebook `DEFAULT_SAMPLES_TO_QUALITY_CHANGE` (INV-08). */
export const QUALITY_MIN_SAMPLES = 5;
/** ENTER-slow failure floor: ≥ 3 failures among the last {@link QUALITY_FAIL_WINDOW} samples (US-03.2). */
export const QUALITY_FAIL_THRESHOLD = 3;
/** Size of the trailing window the failure rule inspects. */
export const QUALITY_FAIL_WINDOW = 5;
/** Uniform minimum dwell in `ok`/`slow` before the inverse transition — museum-door anti-flapping (US-04.2). */
export const QUALITY_DWELL_MS = 30_000;
/** Recency half-life of the weighted median — Chrome NQE `GetWeightMultiplierPerSecond`. */
export const QUALITY_HALF_LIFE_MS = 60_000;
/** Hard cap on the sample window — bounded memory (INV-10 / NFR-04). */
export const QUALITY_BUFFER_MAX = 20;
/** Age eviction horizon — a sample older than 5 min weighs < 3 % at the 60 s half-life (US-10.4). */
export const QUALITY_STALE_MS = 5 * 60_000;

/** Pristine engine state anchored at the injected clock. */
export function initialQualityEngineState(nowMs: number): QualityEngineState {
  return { state: 'unknown', stateSinceMs: nowMs, samples: [], slowEnteredAtMs: null };
}

/** Network-identity change (US-04.3): empty window, back to `unknown`, dwell re-anchored. */
export function resetQualityEngine(nowMs: number): QualityEngineState {
  return initialQualityEngineState(nowMs);
}

/** Fresh ⇔ age strictly under {@link QUALITY_STALE_MS} at `nowMs` (design §2.1). */
const onlyFresh = (samples: readonly QualitySample[], nowMs: number): readonly QualitySample[] =>
  samples.filter((sample) => nowMs - sample.atMs < QUALITY_STALE_MS);

/**
 * Recency-weighted median of the RTTs of `ok` samples ONLY — a failure has no
 * interpretable network RTT (design P-05). Weight = `0.5 ** ((nowMs − atMs) /
 * QUALITY_HALF_LIFE_MS)` (Chrome NQE). Returns `null` when no `ok` sample
 * exists. Exported for TR-01.
 */
export function weightedMedianRtt(samples: readonly QualitySample[], nowMs: number): number | null {
  const weighted = samples
    .filter((sample) => sample.ok)
    .map((sample) => ({
      rttMs: sample.rttMs,
      weight: 0.5 ** ((nowMs - sample.atMs) / QUALITY_HALF_LIFE_MS),
    }))
    .sort((a, b) => a.rttMs - b.rttMs);
  if (weighted.length === 0) return null;

  const halfWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0) / 2;
  let cumulative = 0;
  for (const entry of weighted) {
    cumulative += entry.weight;
    if (cumulative >= halfWeight) return entry.rttMs;
  }
  // Unreachable (cumulative reaches the total, which is ≥ halfWeight); satisfies tsc.
  return weighted[weighted.length - 1]?.rttMs ?? null;
}

/**
 * ENTER-slow condition (INV-07): weighted median ≥ {@link QUALITY_ENTER_RTT_MS}
 * OR ≥ {@link QUALITY_FAIL_THRESHOLD} failures among the last
 * {@link QUALITY_FAIL_WINDOW} samples. Caller guarantees the window holds
 * ≥ {@link QUALITY_MIN_SAMPLES} fresh samples (INV-08).
 */
const isEnterSlowMet = (samples: readonly QualitySample[], nowMs: number): boolean => {
  const median = weightedMedianRtt(samples, nowMs);
  if (median !== null && median >= QUALITY_ENTER_RTT_MS) return true;
  const failures = samples.slice(-QUALITY_FAIL_WINDOW).filter((sample) => !sample.ok).length;
  return failures >= QUALITY_FAIL_THRESHOLD;
};

/**
 * EXIT-slow condition (US-04.1): ≥ {@link QUALITY_MIN_SAMPLES} fresh samples
 * strictly POSTERIOR to the slow entry, zero timeout among them, and their
 * weighted median ≤ {@link QUALITY_EXIT_RTT_MS}. A non-timeout network failure
 * does NOT block the exit (US-04.1 pins timeouts only).
 */
const isExitSlowMet = (
  samples: readonly QualitySample[],
  slowEnteredAtMs: number | null,
  nowMs: number,
): boolean => {
  if (slowEnteredAtMs === null) return false;
  const postEntry = samples.filter((sample) => sample.atMs > slowEnteredAtMs);
  if (postEntry.length < QUALITY_MIN_SAMPLES) return false;
  if (postEntry.some((sample) => sample.timedOut)) return false;
  const median = weightedMedianRtt(postEntry, nowMs);
  return median !== null && median <= QUALITY_EXIT_RTT_MS;
};

/**
 * Next state given the (already evicted/capped) window. Transition rules
 * (design §2.1): window < {@link QUALITY_MIN_SAMPLES} ⇒ `unknown` (INV-08,
 * no dwell — eviction takes ≥ 5 min by construction); `unknown→ok/slow` free
 * (spec acceptance #2: slow from boot without waiting 30 s); `ok↔slow` gated
 * by the uniform {@link QUALITY_DWELL_MS} dwell (US-04.2 — literally "never
 * slow→ok→slow nor ok→slow→ok within 30 s" with ONE testable rule).
 */
const decideState = (
  previous: QualityEngineState,
  samples: readonly QualitySample[],
  nowMs: number,
): QualityState => {
  if (samples.length < QUALITY_MIN_SAMPLES) return 'unknown';
  switch (previous.state) {
    case 'unknown':
      return isEnterSlowMet(samples, nowMs) ? 'slow' : 'ok';
    case 'ok': {
      if (!isEnterSlowMet(samples, nowMs)) return 'ok';
      return nowMs - previous.stateSinceMs >= QUALITY_DWELL_MS ? 'slow' : 'ok';
    }
    case 'slow': {
      if (!isExitSlowMet(samples, previous.slowEnteredAtMs, nowMs)) return 'slow';
      return nowMs - previous.stateSinceMs >= QUALITY_DWELL_MS ? 'ok' : 'slow';
    }
  }
};

/** Applies the transition, re-anchoring dwell + slow-entry marks on change. */
const withTransition = (
  previous: QualityEngineState,
  samples: readonly QualitySample[],
  nowMs: number,
): QualityEngineState => {
  const nextState = decideState(previous, samples, nowMs);
  if (nextState === previous.state) {
    return {
      state: previous.state,
      stateSinceMs: previous.stateSinceMs,
      samples,
      slowEnteredAtMs: previous.slowEnteredAtMs,
    };
  }
  return {
    state: nextState,
    stateSinceMs: nowMs,
    samples,
    slowEnteredAtMs: nextState === 'slow' ? nowMs : null,
  };
};

/**
 * Appends a sample (O(1) amortized — NFR-01): age-evicts at `sample.atMs`,
 * caps the buffer at {@link QUALITY_BUFFER_MAX} (oldest dropped, INV-10),
 * then re-evaluates the state machine. Never mutates its input (INV-06).
 */
export function addQualitySample(
  state: QualityEngineState,
  sample: QualitySample,
): QualityEngineState {
  const nowMs = sample.atMs;
  const appended = [...onlyFresh(state.samples, nowMs), sample];
  const capped =
    appended.length > QUALITY_BUFFER_MAX
      ? appended.slice(appended.length - QUALITY_BUFFER_MAX)
      : appended;
  return withTransition(state, capped, nowMs);
}

/**
 * Age-only eviction at an injected `nowMs` (US-10.4 — lets a quiet window die
 * out and the state fall back to `unknown`). Called by the shell's single
 * eviction timer; pure here.
 */
export function evictStaleSamples(state: QualityEngineState, nowMs: number): QualityEngineState {
  return withTransition(state, onlyFresh(state.samples, nowMs), nowMs);
}
