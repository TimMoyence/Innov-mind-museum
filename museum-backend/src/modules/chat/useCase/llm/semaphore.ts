import pLimit from 'p-limit';

import { SemaphoreQueueFullError } from '@modules/chat/domain/errors/semaphore-queue-full.error';
import { SemaphoreTimeoutError } from '@modules/chat/domain/errors/semaphore-timeout.error';

export { SemaphoreQueueFullError, SemaphoreTimeoutError };

interface SemaphoreOptions {
  maxConcurrent: number;
  maxQueueSize?: number;
  acquireTimeoutMs?: number;
}

/**
 * Counting semaphore that limits the number of concurrently executing async tasks.
 * Thin wrapper around `p-limit` adding (a) bounded queue size and (b) acquire
 * timeout — both absent from p-limit's primitive.
 *
 * Synchronous counters (`_inFlight`, `_waiting`) shadow p-limit's
 * `activeCount`/`pendingCount` to provide immediate visibility from
 * synchronous test patterns (p-limit defers slot promotion to the next
 * microtask, which would otherwise make `queueSize` flicker).
 */
export class Semaphore {
  private readonly limit: ReturnType<typeof pLimit>;
  private readonly _maxConcurrent: number;
  private readonly _maxQueueSize: number;
  private readonly _acquireTimeoutMs: number;
  private _inFlight = 0;
  private _waiting = 0;

  constructor(options: number | SemaphoreOptions) {
    const opts: SemaphoreOptions =
      typeof options === 'number' ? { maxConcurrent: options } : options;
    this._maxConcurrent = opts.maxConcurrent;
    this._maxQueueSize = opts.maxQueueSize ?? 200;
    this._acquireTimeoutMs = opts.acquireTimeoutMs ?? 30_000;
    this.limit = pLimit(this._maxConcurrent);
  }

  /** Number of tasks currently waiting in the queue. */
  get queueSize(): number {
    return this._waiting;
  }

  /** Number of tasks currently executing (holding a slot). */
  get inFlightCount(): number {
    return this._inFlight;
  }

  /**
   * Acquires a slot, executes the task, then releases the slot.
   * Rejects with `SemaphoreQueueFullError` when the queue is at capacity,
   * or `SemaphoreTimeoutError` when the acquire takes longer than the
   * configured timeout.
   */
  use<T>(task: () => Promise<T>): Promise<T> {
    if (this._waiting >= this._maxQueueSize && this._inFlight >= this._maxConcurrent) {
      return Promise.reject(new SemaphoreQueueFullError(this._waiting));
    }

    const acquiredImmediately = this._inFlight < this._maxConcurrent;
    if (acquiredImmediately) {
      this._inFlight += 1;
    } else {
      this._waiting += 1;
    }

    // Acquire-timeout only applies to queued tasks; tasks that get a slot
    // immediately are not subject to it (matches the previous semaphore).
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    const timeoutPromise: Promise<never> = acquiredImmediately
      ? new Promise<never>(() => {
          /* never settles — acquiredImmediately path has no timeout */
        })
      : new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            timedOut = true;
            if (this._waiting > 0) this._waiting -= 1;
            reject(new SemaphoreTimeoutError(this._acquireTimeoutMs));
          }, this._acquireTimeoutMs);
        });

    const run = this.limit(async () => {
      // When the timeout already fired, the race winner is the rejected
      // timeoutPromise — the value returned here is never read (Promise.race
      // already settled with the rejection). `as never` keeps TS happy without
      // the noisier `as unknown as T` lossy cast.
      if (timedOut) return undefined as never;
      // Promote from waiting → in-flight when the slot frees up.
      if (!acquiredImmediately) {
        if (this._waiting > 0) this._waiting -= 1;
        this._inFlight += 1;
      }
      try {
        return await task();
      } finally {
        this._inFlight = Math.max(0, this._inFlight - 1);
      }
    });

    return Promise.race([run, timeoutPromise]).finally(() => {
      if (timer !== undefined) clearTimeout(timer);
      if (timedOut) {
        run.catch(() => {
          /* swallow — timeout already surfaced the user-visible error */
        });
      }
    });
  }
}
