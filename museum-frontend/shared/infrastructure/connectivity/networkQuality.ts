export type QualityState = 'unknown' | 'ok' | 'slow';

export interface QualitySample {
  readonly rttMs: number;
  readonly ok: boolean;
  readonly timedOut: boolean;
  readonly atMs: number;
}

export interface QualityEngineState {
  readonly state: QualityState;
  readonly stateSinceMs: number;
  readonly samples: readonly QualitySample[];
  readonly slowEnteredAtMs: number | null;
}

export const QUALITY_ENTER_RTT_MS = 1400;
export const QUALITY_EXIT_RTT_MS = 1000;
export const QUALITY_MIN_SAMPLES = 5;
export const QUALITY_FAIL_THRESHOLD = 3;
export const QUALITY_FAIL_WINDOW = 5;
export const QUALITY_DWELL_MS = 30_000;
export const QUALITY_HALF_LIFE_MS = 60_000;
export const QUALITY_BUFFER_MAX = 20;
export const QUALITY_STALE_MS = 5 * 60_000;

export function initialQualityEngineState(nowMs: number): QualityEngineState {
  return { state: 'unknown', stateSinceMs: nowMs, samples: [], slowEnteredAtMs: null };
}

export function resetQualityEngine(nowMs: number): QualityEngineState {
  return initialQualityEngineState(nowMs);
}

const onlyFresh = (samples: readonly QualitySample[], nowMs: number): readonly QualitySample[] =>
  samples.filter((sample) => nowMs - sample.atMs < QUALITY_STALE_MS);

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
  return weighted[weighted.length - 1]?.rttMs ?? null;
}

const isEnterSlowMet = (samples: readonly QualitySample[], nowMs: number): boolean => {
  const median = weightedMedianRtt(samples, nowMs);
  if (median !== null && median >= QUALITY_ENTER_RTT_MS) return true;
  const failures = samples.slice(-QUALITY_FAIL_WINDOW).filter((sample) => !sample.ok).length;
  return failures >= QUALITY_FAIL_THRESHOLD;
};

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

export function evictStaleSamples(state: QualityEngineState, nowMs: number): QualityEngineState {
  return withTransition(state, onlyFresh(state.samples, nowMs), nowMs);
}
