import { AppError } from '@shared/errors/app.error';

/**
 * Thrown when an LLM semaphore acquirer waited longer than the configured
 * timeout before a slot freed up. Extends `AppError` so the global error
 * middleware returns 503.
 */
export class SemaphoreTimeoutError extends AppError {
  constructor(timeoutMs: number) {
    super({
      message: `Semaphore acquire timed out after ${String(timeoutMs)}ms`,
      statusCode: 503,
      code: 'SEMAPHORE_TIMEOUT',
    });
    this.name = 'SemaphoreTimeoutError';
  }
}
