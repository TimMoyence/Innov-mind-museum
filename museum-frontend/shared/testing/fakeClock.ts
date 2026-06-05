/**
 * FakeClock — an injected, deterministic virtual clock (TEST-ONLY).
 *
 * Time only moves when the test tells it to (`advance` / `runAll`); there is no
 * wall-clock wait and no `Date.now()`. Timers fire at their due time in
 * scheduling-stable due-time order. `setTimeout` returns a Promise that resolves
 * once its callback has fired, so it can be used as the `sleep` hook of
 * `runWithRetry` and driven entirely by `runAll()`.
 *
 * Used by the weak-network harness so a degraded-network scenario (latency,
 * backoff budget, token pacing) is reproducible to the millisecond.
 */
interface ScheduledTimer {
  readonly id: number;
  readonly dueAt: number;
  readonly callback: () => void;
  fired: boolean;
}

/**
 * Yields the event loop enough times for a chain of awaited continuations to
 * settle and (re)schedule follow-up timers. A single microtask turn is not
 * enough when a continuation does `await op()` then `await sleep()` (several
 * ticks): we drain a handful of turns so the next timer is registered before the
 * driver decides nothing is pending.
 */
const flushMicrotasks = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
};

export class FakeClock {
  private currentMs = 0;
  private nextId = 1;
  private timers: ScheduledTimer[] = [];

  /** Current virtual time in ms (starts at 0). */
  now(): number {
    return this.currentMs;
  }

  /**
   * Schedules `callback` to fire `delayMs` from now. Returns a Promise that
   * resolves once the callback has fired (after `advance` / `runAll` reaches it).
   */
  setTimeout(callback: () => void, delayMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      this.timers.push({
        id: this.nextId++,
        dueAt: this.currentMs + Math.max(0, delayMs),
        callback: () => {
          callback();
          resolve();
        },
        fired: false,
      });
    });
  }

  /**
   * Advances virtual time by `ms`, firing every timer whose due time is now
   * reached, in due-time (then scheduling) order. Microtasks are flushed after
   * each timer so awaited continuations can schedule follow-up timers before the
   * window closes.
   */
  async advance(ms: number): Promise<void> {
    const target = this.currentMs + Math.max(0, ms);
    // Synchronous effect: virtual time moves and every due timer fires in
    // due-time order BEFORE this returns, so `clock.advance(250); clock.now()`
    // reads 250 without awaiting.
    for (;;) {
      const due = this.pendingDueBy(target);
      if (!due) break;
      this.currentMs = due.dueAt;
      due.fired = true;
      due.callback();
    }
    this.currentMs = target;
    // Trailing flush lets the continuations awaited off the fired timers (e.g. a
    // `sim.run` resolving its `op()`) settle for callers that `await advance(...)`.
    await flushMicrotasks();
  }

  /**
   * Drains every scheduled timer — including timers scheduled while draining —
   * advancing virtual time to each due time in order. Resolves when no pending
   * timer remains.
   */
  async runAll(): Promise<void> {
    // Drain queued microtasks first so a not-yet-scheduled timer (awaited off a
    // pending promise) is registered before we decide there is nothing to run.
    await flushMicrotasks();
    for (;;) {
      const next = this.earliestPending();
      if (!next) break;
      if (next.dueAt > this.currentMs) this.currentMs = next.dueAt;
      next.fired = true;
      next.callback();
      await flushMicrotasks();
    }
  }

  private earliestPending(): ScheduledTimer | undefined {
    let earliest: ScheduledTimer | undefined;
    for (const t of this.timers) {
      if (t.fired) continue;
      if (
        !earliest ||
        t.dueAt < earliest.dueAt ||
        (t.dueAt === earliest.dueAt && t.id < earliest.id)
      ) {
        earliest = t;
      }
    }
    return earliest;
  }

  private pendingDueBy(target: number): ScheduledTimer | undefined {
    const earliest = this.earliestPending();
    if (earliest && earliest.dueAt <= target) return earliest;
    return undefined;
  }
}
