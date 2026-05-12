import { AppError } from '@shared/errors/app.error';

/**
 * Thrown when the LLM semaphore queue is at capacity and a new acquirer cannot
 * be enqueued. Extends `AppError` so the global error middleware returns 503.
 */
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
