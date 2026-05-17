import { logger } from '@shared/logger/logger';

export function fireAndForget(promise: Promise<unknown>, context: string): void {
  promise.catch((error: unknown) => {
    logger.warn('fire_and_forget_failed', {
      context,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
