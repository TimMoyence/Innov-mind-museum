import { logger } from '@shared/logger/logger';

/** Options for {@link withOptimisticLockRetry}. */
export interface OptimisticLockRetryOptions<T> {
  /** The mutation to attempt — typically a `repository.save(entity)` call. */
  mutation: () => Promise<T>;
  /**
   * Refetches and reconciles the entity after a version-mismatch retry.
   * Called between failed attempts so the next mutation operates on fresh state.
   */
  refetch: () => Promise<void>;
  /** Maximum number of attempts. Default 3. */
  maxAttempts?: number;
  /** Base delay before the first retry in ms. Default 50. */
  baseDelayMs?: number;
  /** Optional context tag for log lines. */
  context?: string;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 50;

/**
 * Runs `mutation` with optimistic-lock retry. On
 * `OptimisticLockVersionMismatchError` (TypeORM), refetches the entity (so the
 * caller's reference is fresh), waits jittered exponential backoff, and
 * retries. After `maxAttempts` exhausted attempts, the original error is
 * rethrown so the HTTP layer can surface a 409.
 *
 * Other errors are rethrown immediately — no retry on unrelated failures.
 *
 * Used to absorb short-lived admin contention (two operators saving the same
 * museum simultaneously). Sustained contention surfaces a 409 to the caller.
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
