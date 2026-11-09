import pLimit from 'p-limit';

import { SemaphoreQueueFullError } from '@modules/chat/domain/errors/semaphore-queue-full.error';
import { SemaphoreTimeoutError } from '@modules/chat/domain/errors/semaphore-timeout.error';

export { SemaphoreQueueFullError, SemaphoreTimeoutError };

interface SemaphoreOptions {
  maxConcurrent: number;
  maxQueueSize?: number;
  acquireTimeoutMs?: number;
}

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

  get queueSize(): number {
    return this._waiting;
  }

  get inFlightCount(): number {
    return this._inFlight;
  }

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

    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    const timeoutPromise: Promise<never> = acquiredImmediately
      ? new Promise<never>(() => undefined)
      : new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            timedOut = true;
            if (this._waiting > 0) this._waiting -= 1;
            reject(new SemaphoreTimeoutError(this._acquireTimeoutMs));
          }, this._acquireTimeoutMs);
        });

    const run = this.limit(async () => {
      if (timedOut) return undefined as never;
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
        run.catch(() => undefined);
      }
    });
  }
}
