import { perfStore } from '@/features/diagnostics/perfStore';

describe('perfStore', () => {
  beforeEach(() => {
    perfStore.reset();
  });

  it('starts at zero FPS with a null last render', () => {
    const snapshot = perfStore.get();
    expect(snapshot.fpsP50).toBe(0);
    expect(snapshot.fpsP5).toBe(0);
    expect(snapshot.lastRenderMs).toBeNull();
  });

  it('publishes FPS updates to subscribers', () => {
    const seen: number[] = [];
    const unsubscribe = perfStore.subscribe((metrics) => seen.push(metrics.fpsP50));
    perfStore.updateFps(60, 58);
    expect(perfStore.get().fpsP50).toBe(60);
    expect(seen.at(-1)).toBe(60);
    unsubscribe();
  });

  it('measures the last render bracket between markRenderStart and markRenderEnd', () => {
    perfStore.markRenderStart();
    perfStore.markRenderEnd();
    const ms = perfStore.get().lastRenderMs;
    expect(ms).not.toBeNull();
    expect(ms ?? 0).toBeGreaterThanOrEqual(0);
  });

  it('ignores markRenderEnd when no start was recorded', () => {
    perfStore.markRenderEnd();
    expect(perfStore.get().lastRenderMs).toBeNull();
  });

  it('stops notifying after unsubscribe', () => {
    const seen: number[] = [];
    const unsubscribe = perfStore.subscribe((metrics) => seen.push(metrics.fpsP50));
    const callsAfterSubscribe = seen.length;
    unsubscribe();
    perfStore.updateFps(30, 20);
    expect(seen.length).toBe(callsAfterSubscribe);
  });
});
