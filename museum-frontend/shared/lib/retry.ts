import { isAppError } from './errors';

export type RetryableOperation<T> = () => Promise<T>;

export type RetryDecision = 'retry' | 'fatal';

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
  return true;
};

export const DEFAULT_BACKOFF_MS: readonly number[] = [500, 2000, 8000];

export interface RetryOptions {
  attempts?: number;
  backoff?: readonly number[];
  shouldRetry?: (error: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
  signal?: AbortSignal;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

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
