import { logger } from '@shared/logger/logger';

export interface OptimisticLockRetryOptions<T> {
  /** Typically `repository.save(entity)`. */
  mutation: () => Promise<T>;
  /** Called between failed attempts so next mutation has fresh state. */
  refetch: () => Promise<void>;
  /** Default 3. */
  maxAttempts?: number;
  /** First retry base delay (ms). Default 50. */
  baseDelayMs?: number;
  context?: string;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 50;

/**
 * Retries on `OptimisticLockVersionMismatchError` (TypeORM): refetch entity,
 * jittered exponential backoff. After `maxAttempts`, original error rethrown
 * for HTTP 409. Other errors rethrown immediately. Absorbs short-lived admin
 * contention (two operators saving same museum); sustained → 409.
 */
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
        // eslint-disable-next-line sonarjs/pseudo-random -- jitter for retry backoff, not security-sensitive
        const jitter = Math.floor(Math.random() * Math.max(1, baseDelayMs));
        const delay = baseDelayMs * 2 ** (attempt - 1) + jitter;
        await new Promise<void>((resolve) => {
          setTimeout(resolve, delay);
        });
      }
    }
  }

  throw lastError;
}
