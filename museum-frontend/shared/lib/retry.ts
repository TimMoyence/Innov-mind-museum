import { isAppError } from './errors';

/** Thunk returning a Promise — used as the unit of work for retry/backoff. */
export type RetryableOperation<T> = () => Promise<T>;

/** Outcome decision computed from a caught error (see {@link isRetryableError}). */
export type RetryDecision = 'retry' | 'fatal';

/**
 * Decides whether an error is worth retrying.
 *
 * Retryable: transient failures (network hiccup, server 5xx, explicit rate limit,
 * client timeout). Everything else is treated as fatal so that a malformed
 * payload or an expired token does not burn the whole backoff budget.
 */
export const isRetryableError = (error: unknown): boolean => {
  if (isAppError(error)) {
    switch (error.kind) {
      case 'Network':
      case 'Timeout':
      case 'RateLimited':
        return true;
      default:
        if (typeof error.status === 'number' && error.status >= 500) return true;
        if (error.status === 408 || error.status === 429) return true;
        return false;
    }
  }
  // Unstructured errors (offline, AbortError, fetch failures) → retry by default.
  return true;
};

/** Backoff delays (ms) applied between retries. The Nth retry waits delays[N-1]. */
export const DEFAULT_BACKOFF_MS: readonly number[] = [500, 2000, 8000];

export interface RetryOptions {
  /** Total number of attempts including the first call. Defaults to `backoff.length + 1`. */
  attempts?: number;
  /** Backoff schedule in ms. Use a shorter array for fewer retries. */
  backoff?: readonly number[];
  /** Predicate run on caught errors; return `true` to continue retrying. */
  shouldRetry?: (error: unknown) => boolean;
  /**
   * Hook called between retries — exposed so tests can replace it with an
   * instant resolver and production code can plug in jitter if needed.
   */
  sleep?: (ms: number) => Promise<void>;
  /** Optional AbortSignal — when aborted, the current sleep resolves and the retry loop exits. */
  signal?: AbortSignal;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Executes `op` and retries on retryable failures using the provided backoff
 * schedule. Throws the final error if all attempts fail.
 *
 * Invariants:
 *  - Never retries a fatal error (aborts fast on 4xx/Validation/Contract).
 *  - Total calls to `op` = min(attempts, backoff.length + 1).
 *  - If `signal` aborts mid-sleep, the loop exits with the latest error.
 */
export const runWithRetry = async <T>(
  op: RetryableOperation<T>,
  options: RetryOptions = {},
): Promise<T> => {
  const backoff = options.backoff ?? DEFAULT_BACKOFF_MS;
  const attempts = options.attempts ?? backoff.length + 1;
  const shouldRetry = options.shouldRetry ?? isRetryableError;
  const sleep = options.sleep ?? defaultSleep;
  const signal = options.signal;

  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    if (signal?.aborted) break;
    try {
      return await op();
    } catch (error) {
      lastError = error;
      const isLastAttempt = i >= attempts - 1;
      if (isLastAttempt || !shouldRetry(error)) {
        throw error;
      }
      const delay = backoff[i] ?? backoff[backoff.length - 1] ?? 0;
      await sleep(delay);
    }
  }
  throw lastError;
};
