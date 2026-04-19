import { useEffect } from 'react';

import { perfStore } from './perfStore';

const WINDOW_SIZE = 60;
const P5_INDEX = Math.floor(WINDOW_SIZE * 0.05);

/**
 * Runs a requestAnimationFrame loop while mounted, computes P50 and P5 FPS
 * over a 60-frame ring buffer, and publishes them to the shared perfStore
 * every frame. Caller is expected to gate this hook behind `__DEV__` — it is
 * safe to run in production but there is no consumer for the values there.
 */
export const useFpsMeter = (enabled: boolean): void => {
  useEffect(() => {
    if (!enabled) return;

    const deltas: number[] = new Array<number>(WINDOW_SIZE);
    for (let i = 0; i < WINDOW_SIZE; i += 1) {
      deltas[i] = 16.67;
    }
    let writeIndex = 0;
    let lastTime = performance.now();
    let frameId = 0;

    const tick = (now: number) => {
      deltas[writeIndex] = now - lastTime;
      writeIndex = (writeIndex + 1) % WINDOW_SIZE;
      lastTime = now;

      const sorted = [...deltas].sort((a, b) => a - b);
      const meanDelta = sorted.reduce((acc, d) => acc + d, 0) / WINDOW_SIZE;
      // Worst-percentile deltas -> lowest FPS values -> take from the high end.
      const p5Delta = sorted[WINDOW_SIZE - 1 - P5_INDEX] ?? meanDelta;
      perfStore.updateFps(meanDelta > 0 ? 1000 / meanDelta : 0, p5Delta > 0 ? 1000 / p5Delta : 0);

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameId);
      perfStore.reset();
    };
  }, [enabled]);
};
