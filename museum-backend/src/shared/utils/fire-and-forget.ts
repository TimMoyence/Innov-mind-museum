import { logger } from '@shared/logger/logger';

/**
 * Executes a promise without awaiting it, logging any errors at warn level.
 * Use for non-critical background operations (cache updates, analytics, etc.).
 */
export function fireAndForget(promise: Promise<unknown>, context: string): void {
  promise.catch((error: unknown) => {
    logger.warn('fire_and_forget_failed', {
      context,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
