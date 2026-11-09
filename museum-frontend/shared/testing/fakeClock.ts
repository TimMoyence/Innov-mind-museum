interface ScheduledTimer {
  readonly id: number;
  readonly dueAt: number;
  readonly callback: () => void;
  fired: boolean;
}

const flushMicrotasks = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
};

export class FakeClock {
  private currentMs = 0;
  private nextId = 1;
  private timers: ScheduledTimer[] = [];

  now(): number {
    return this.currentMs;
  }

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

  async advance(ms: number): Promise<void> {
    const target = this.currentMs + Math.max(0, ms);
    for (;;) {
      const due = this.pendingDueBy(target);
      if (!due) break;
      this.currentMs = due.dueAt;
      due.fired = true;
      due.callback();
    }
    this.currentMs = target;
    await flushMicrotasks();
  }

  async runAll(): Promise<void> {
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
