/**
 * Counting semaphore that limits the number of concurrently executing async tasks.
 * Tasks that exceed the limit are queued and executed in FIFO order as slots free up.
 */
export class Semaphore {
  private readonly queue: (() => void)[] = [];
  private inFlight = 0;

  constructor(private readonly maxConcurrent: number) {}

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
    if (this.inFlight < this.maxConcurrent) {
      this.inFlight += 1;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.queue.push(() => {
        this.inFlight += 1;
        resolve();
      });
    });
  }

  private release(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }
}
