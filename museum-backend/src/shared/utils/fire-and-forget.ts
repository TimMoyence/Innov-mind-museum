import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';

export function fireAndForget(promise: Promise<unknown>, context: string): void {
  promise.catch((error: unknown) => {
    logger.warn('fire_and_forget_failed', {
      context,
      error: errorMessage(error),
    });
  });
}
