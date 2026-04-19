export interface PerfMetrics {
  /** Rolling P50 FPS over the last window (rAF deltas). */
  fpsP50: number;
  /** Rolling P5 FPS — low percentile, indicator of stutter. */
  fpsP5: number;
  /** Most recent clustering render bracket in milliseconds, or null if none yet. */
  lastRenderMs: number | null;
}

type Listener = (metrics: PerfMetrics) => void;

const INITIAL_METRICS: PerfMetrics = {
  fpsP50: 0,
  fpsP5: 0,
  lastRenderMs: null,
};

let metrics: PerfMetrics = INITIAL_METRICS;
const listeners = new Set<Listener>();
let renderStartedAt: number | null = null;

const emit = (): void => {
  for (const listener of listeners) {
    listener(metrics);
  }
};

/**
 * Diagnostic perf store for the MapLibre rollout. Values are only populated
 * when the FPS meter is running and the MapView signals render bracket events.
 * In release bundles no one subscribes and the store sits at defaults, so it
 * has no runtime cost.
 */
export const perfStore = {
  get: (): PerfMetrics => metrics,
  subscribe: (listener: Listener): (() => void) => {
    listeners.add(listener);
    listener(metrics);
    return () => {
      listeners.delete(listener);
    };
  },
  updateFps: (fpsP50: number, fpsP5: number): void => {
    metrics = { ...metrics, fpsP50, fpsP5 };
    emit();
  },
  markRenderStart: (): void => {
    renderStartedAt = performance.now();
  },
  markRenderEnd: (): void => {
    if (renderStartedAt === null) return;
    const lastRenderMs = performance.now() - renderStartedAt;
    renderStartedAt = null;
    metrics = { ...metrics, lastRenderMs };
    emit();
  },
  reset: (): void => {
    metrics = INITIAL_METRICS;
    renderStartedAt = null;
    emit();
  },
};
