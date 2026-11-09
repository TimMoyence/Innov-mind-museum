import { logger } from '@shared/logger/logger';
import { randomSource } from '@shared/utils/random';

export interface OptimisticLockRetryOptions<T> {
  mutation: () => Promise<T>;
  refetch: () => Promise<void>;
  maxAttempts?: number;
  baseDelayMs?: number;
  context?: string;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 50;

export async function withOptimisticLockRetry<T>(opts: OptimisticLockRetryOptions<T>): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await opts.mutation();
    } catch (err) {
      const isOptimistic =
        err instanceof Error && err.name === 'OptimisticLockVersionMismatchError';
      if (!isOptimistic) {
        throw err;
      }
      lastError = err;
      if (attempt < maxAttempts) {
        logger.warn('optimistic_lock_retry', {
          attempt,
          maxAttempts,
          context: opts.context,
        });
        await opts.refetch();
        const jitter = Math.floor(randomSource.unit() * Math.max(1, baseDelayMs));
        const delay = baseDelayMs * 2 ** (attempt - 1) + jitter;
        await new Promise<void>((resolve) => {
          setTimeout(resolve, delay);
        });
      }
    }
  }

  throw lastError;
}
