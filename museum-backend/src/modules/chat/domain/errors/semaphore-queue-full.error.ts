import { AppError } from '@shared/errors/app.error';

/** Extends `AppError` → 503 via global error middleware. */
export class SemaphoreQueueFullError extends AppError {
  constructor(queueSize: number) {
    super({
      message: `Semaphore queue is full (${String(queueSize)} waiting)`,
      statusCode: 503,
      code: 'SEMAPHORE_QUEUE_FULL',
    });
    this.name = 'SemaphoreQueueFullError';
  }
}
