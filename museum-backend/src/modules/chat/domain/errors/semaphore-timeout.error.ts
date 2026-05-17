import { AppError } from '@shared/errors/app.error';

/** Extends `AppError` → 503 via global error middleware. */
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
