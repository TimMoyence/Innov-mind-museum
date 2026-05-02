import '@/__tests__/helpers/test-utils';
import { renderHook, act } from '@testing-library/react-native';

import { perfStore } from '@/features/diagnostics/perfStore';
import { useFpsMeter } from '@/features/diagnostics/useFpsMeter';

// ── rAF harness ──────────────────────────────────────────────────────────────
// react-native's jest preset installs a setup.js that polyfills
// requestAnimationFrame onto a setTimeout(_, 1000/60) call. We replace it with
// a manual scheduler so tests can step through frames deterministically.

type FrameCallback = (now: number) => void;

interface RafHarness {
  install: () => void;
  uninstall: () => void;
  step: (deltaMs?: number) => void;
  pendingCount: () => number;
}

const createRafHarness = (): RafHarness => {
  let frame = 0;
  let now = 1000;
  const queue = new Map<number, FrameCallback>();

  const originalRaf = global.requestAnimationFrame;
  const originalCancel = global.cancelAnimationFrame;

  return {
    install() {
      global.requestAnimationFrame = ((cb: FrameCallback) => {
        frame += 1;
        queue.set(frame, cb);
        return frame;
      }) as typeof global.requestAnimationFrame;
      global.cancelAnimationFrame = ((id: number) => {
        queue.delete(id);
      }) as typeof global.cancelAnimationFrame;
    },
    uninstall() {
      global.requestAnimationFrame = originalRaf;
      global.cancelAnimationFrame = originalCancel;
      queue.clear();
    },
    step(deltaMs = 16.67) {
      // Process exactly one queued frame (the most recently registered) so
      // each step advances the rAF loop by one tick.
      const ids = [...queue.keys()];
      const id = ids[ids.length - 1];
      if (id === undefined) return;
      const cb = queue.get(id);
      queue.delete(id);
      now += deltaMs;
      cb?.(now);
    },
    pendingCount: () => queue.size,
  };
};

describe('useFpsMeter', () => {
  let raf: RafHarness;

  beforeEach(() => {
    raf = createRafHarness();
    raf.install();
    perfStore.reset();
  });

  afterEach(() => {
    raf.uninstall();
  });

  it('schedules a rAF tick on mount when enabled', () => {
    renderHook(() => {
      useFpsMeter(true);
    });

    expect(raf.pendingCount()).toBe(1);
  });

  it('does not schedule a rAF tick when disabled', () => {
    renderHook(() => {
      useFpsMeter(false);
    });

    expect(raf.pendingCount()).toBe(0);
  });

  it('publishes a near-60 FPS reading after a steady 16.67ms-frame burst', () => {
    renderHook(() => {
      useFpsMeter(true);
    });

    // 60 frames of 16.67ms steady cadence → P50 delta = 16.67 → ~60 FPS.
    act(() => {
      for (let i = 0; i < 60; i += 1) {
        raf.step(16.67);
      }
    });

    const snapshot = perfStore.get();
    expect(snapshot.fpsP50).toBeGreaterThan(58);
    expect(snapshot.fpsP50).toBeLessThan(62);
  });

  it('reports a lower P5 FPS than P50 when stutter frames are injected', () => {
    renderHook(() => {
      useFpsMeter(true);
    });

    // Mostly fast frames + a handful of slow (200ms = 5 FPS) frames; the
    // P5 (worst-5%) bucket must reflect the stutter.
    act(() => {
      for (let i = 0; i < 54; i += 1) {
        raf.step(16.67);
      }
      for (let i = 0; i < 6; i += 1) {
        raf.step(200);
      }
    });

    const snapshot = perfStore.get();
    expect(snapshot.fpsP5).toBeLessThan(snapshot.fpsP50);
    expect(snapshot.fpsP5).toBeLessThan(20);
  });

  it('keeps scheduling subsequent frames while mounted (continuous loop)', () => {
    renderHook(() => {
      useFpsMeter(true);
    });

    expect(raf.pendingCount()).toBe(1);
    act(() => {
      raf.step(16.67);
    });
    expect(raf.pendingCount()).toBe(1);
    act(() => {
      raf.step(16.67);
    });
    expect(raf.pendingCount()).toBe(1);
  });

  it('cancels the pending rAF and resets the perf store on unmount', () => {
    const { unmount } = renderHook(() => {
      useFpsMeter(true);
    });

    act(() => {
      raf.step(16.67);
    });
    perfStore.updateFps(45, 30); // simulate populated state
    expect(perfStore.get().fpsP50).toBe(45);

    unmount();

    expect(raf.pendingCount()).toBe(0);
    const snapshot = perfStore.get();
    expect(snapshot.fpsP50).toBe(0);
    expect(snapshot.fpsP5).toBe(0);
    expect(snapshot.lastRenderMs).toBeNull();
  });

  it('emits zero FPS when the median frame delta is non-positive', () => {
    renderHook(() => {
      useFpsMeter(true);
    });

    // 60 zero-ms frames → median delta = 0 → guard branch returns 0.
    act(() => {
      for (let i = 0; i < 60; i += 1) {
        raf.step(0);
      }
    });

    expect(perfStore.get().fpsP50).toBe(0);
  });
});
