export interface PerfMetrics {
  fpsP50: number;
  fpsP5: number;
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
