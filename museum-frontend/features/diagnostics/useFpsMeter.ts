import { useEffect } from 'react';

import { perfStore } from './perfStore';

const WINDOW_SIZE = 60;
const P50_INDEX = Math.floor(WINDOW_SIZE * 0.5);
const P5_INDEX = Math.floor(WINDOW_SIZE * 0.05);

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
      const p50Delta = sorted[P50_INDEX] ?? 16.67;
      const p5Delta = sorted[WINDOW_SIZE - 1 - P5_INDEX] ?? p50Delta;
      perfStore.updateFps(p50Delta > 0 ? 1000 / p50Delta : 0, p5Delta > 0 ? 1000 / p5Delta : 0);

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameId);
      perfStore.reset();
    };
  }, [enabled]);
};
