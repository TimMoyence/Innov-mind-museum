/**
 * ADR-047 — caps fan-out to LLM Guard /scan (maxInflight, default 8) + queues
 * (queueMax, default 32). Beyond queue → ScanSemaphoreOverflowError; adapter
 * MUST translate to fail-CLOSED. Prevents surge → P95 explosion → death spiral.
 * Always-on; both bounds are operational tunables (LLM_GUARD_MAX_INFLIGHT/QUEUE_MAX).
 * release() hands freed slot directly to queue head (race-free under microtasks).
 */

export class ScanSemaphoreOverflowError extends Error {
  constructor() {
    super('LLM Guard scan semaphore queue full — fail-closing to protect the sidecar');
    this.name = 'ScanSemaphoreOverflowError';
  }
}

export interface ScanInflightSemaphoreStats {
  inFlight: number;
  queued: number;
  maxInflight: number;
  queueMax: number;
}

export class ScanInflightSemaphore {
  private inFlight = 0;
  private readonly queue: (() => void)[] = [];

  constructor(
    private readonly maxInflight: number,
    private readonly queueMax: number,
  ) {
    if (!Number.isFinite(maxInflight) || maxInflight < 1) {
      throw new Error(`ScanInflightSemaphore: maxInflight must be ≥ 1, got ${String(maxInflight)}`);
    }
    if (!Number.isFinite(queueMax) || queueMax < 0) {
      throw new Error(`ScanInflightSemaphore: queueMax must be ≥ 0, got ${String(queueMax)}`);
    }
  }

  /**
   * Caller MUST pair every successful acquire with exactly one release
   * (try/finally to avoid slot leak on cancellation).
   *
   * @throws {Error} ScanSemaphoreOverflowError when queue full.
   */
  async acquire(): Promise<void> {
    if (this.inFlight < this.maxInflight) {
      this.inFlight++;
      return;
    }
    if (this.queue.length >= this.queueMax) {
      throw new ScanSemaphoreOverflowError();
    }
    await new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  /** Hands slot directly to queue head (no inFlight decrement/increment race). */
  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
      return;
    }
    if (this.inFlight > 0) this.inFlight--;
  }

  getStats(): ScanInflightSemaphoreStats {
    return {
      inFlight: this.inFlight,
      queued: this.queue.length,
      maxInflight: this.maxInflight,
      queueMax: this.queueMax,
    };
  }
}
