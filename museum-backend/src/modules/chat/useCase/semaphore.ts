/**
 *
 */
export class SemaphoreQueueFullError extends Error {
  constructor(queueSize: number) {
    super(`Semaphore queue is full (${queueSize} waiting)`);
    this.name = 'SemaphoreQueueFullError';
  }
}

/**
 *
 */
export class SemaphoreTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Semaphore acquire timed out after ${timeoutMs}ms`);
    this.name = 'SemaphoreTimeoutError';
  }
}

interface SemaphoreOptions {
  maxConcurrent: number;
  maxQueueSize?: number;
  acquireTimeoutMs?: number;
}

/**
 * Counting semaphore that limits the number of concurrently executing async tasks.
 * Tasks that exceed the limit are queued and executed in FIFO order as slots free up.
 *
 * Supports bounded queue size and acquire timeout to prevent unbounded resource consumption.
 */
export class Semaphore {
  private readonly queue: {
    resolve: () => void;
    reject: (err: Error) => void;
    timer?: ReturnType<typeof setTimeout>;
  }[] = [];
  private _inFlight = 0;
  private readonly _maxConcurrent: number;
  private readonly _maxQueueSize: number;
  private readonly _acquireTimeoutMs: number;

  constructor(options: number | SemaphoreOptions) {
    if (typeof options === 'number') {
      this._maxConcurrent = options;
      this._maxQueueSize = 200;
      this._acquireTimeoutMs = 30_000;
    } else {
      this._maxConcurrent = options.maxConcurrent;
      this._maxQueueSize = options.maxQueueSize ?? 200;
      this._acquireTimeoutMs = options.acquireTimeoutMs ?? 30_000;
    }
  }

  /** Number of tasks currently waiting in the queue. */
  get queueSize(): number {
    return this.queue.length;
  }

  /** Number of tasks currently executing (holding a slot). */
  get inFlightCount(): number {
    return this._inFlight;
  }

  /**
   * Acquires a slot, executes the task, then releases the slot.
   *
   * @param task - Async function to run under the concurrency limit.
   * @returns The resolved value of the task.
   */
  async use<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this._inFlight < this._maxConcurrent) {
      this._inFlight += 1;
      return Promise.resolve();
    }

    if (this.queue.length >= this._maxQueueSize) {
      return Promise.reject(new SemaphoreQueueFullError(this.queue.length));
    }

    return new Promise<void>((resolve, reject) => {
      const entry: {
        resolve: () => void;
        reject: (err: Error) => void;
        timer?: ReturnType<typeof setTimeout>;
      } = { resolve, reject };

      entry.timer = setTimeout(() => {
        const idx = this.queue.indexOf(entry);
        if (idx !== -1) {
          this.queue.splice(idx, 1);
          reject(new SemaphoreTimeoutError(this._acquireTimeoutMs));
        }
      }, this._acquireTimeoutMs);

      this.queue.push(entry);
    });
  }

  private release(): void {
    this._inFlight = Math.max(0, this._inFlight - 1);
    const next = this.queue.shift();
    if (next) {
      if (next.timer) clearTimeout(next.timer);
      this._inFlight += 1;
      next.resolve();
    }
  }
}
