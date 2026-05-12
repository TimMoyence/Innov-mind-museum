/**
 * In-flight concurrency limiter for LLM Guard `/scan` HTTP calls.
 *
 * Sits between `LLMGuardAdapter.scan()` and the sidecar so a traffic surge
 * does not amplify sidecar latency into a death spiral (100 concurrent /scan
 * → P95 explodes → all time out → breaker trips → 100 % fail-CLOSED). The
 * semaphore caps the fan-out to a number the sidecar can sustain
 * (`maxInflight`, default 8 per process) and queues the next `queueMax`
 * (default 32). Beyond the queue, callers receive `ScanSemaphoreOverflowError`
 * and the adapter MUST translate it into a fail-CLOSED return so the safety
 * contract is preserved (ADR-047).
 *
 * Always-on. NOT a feature flag — both bounds are operational tunables
 * (`LLM_GUARD_MAX_INFLIGHT`, `LLM_GUARD_QUEUE_MAX`).
 *
 * The release path always hands the freed slot directly to the queue head
 * without decrementing then re-incrementing `inFlight`, which keeps the
 * accounting race-free under microtask interleaving.
 */

/**
 *
 */
export class ScanSemaphoreOverflowError extends Error {
  constructor() {
    super('LLM Guard scan semaphore queue full — fail-closing to protect the sidecar');
    this.name = 'ScanSemaphoreOverflowError';
  }
}

/**
 *
 */
export interface ScanInflightSemaphoreStats {
  inFlight: number;
  queued: number;
  maxInflight: number;
  queueMax: number;
}

/**
 *
 */
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
   * Reserve a slot. Resolves immediately if `inFlight < maxInflight`,
   * otherwise queues FIFO until a `release()` hands the slot over. Throws
   * `ScanSemaphoreOverflowError` if the queue is already full.
   *
   * Callers MUST pair every successful `acquire()` with exactly one
   * `release()` — preferably via a `try { ... } finally { release(); }`
   * block so cancellations do not leak slots.
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

  /**
   * Free a slot. If a caller is queued, the slot is handed directly to it —
   * `inFlight` stays at the same value. Otherwise `inFlight` decrements.
   */
  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
      return;
    }
    if (this.inFlight > 0) this.inFlight--;
  }

  /**
   *
   */
  /** Returns a snapshot of current inflight + queued counts, for logs + observability. */
  getStats(): ScanInflightSemaphoreStats {
    return {
      inFlight: this.inFlight,
      queued: this.queue.length,
      maxInflight: this.maxInflight,
      queueMax: this.queueMax,
    };
  }
}
