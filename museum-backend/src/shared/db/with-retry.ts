import { logger } from '@shared/logger/logger';

/** PostgreSQL error codes that indicate a transient failure. */
const TRANSIENT_PG_CODES = new Set([
  '08006', // connection_failure
  '08001', // sqlclient_unable_to_establish_sqlconnection
  '57P01', // admin_shutdown
  '40001', // serialization_failure
  '40P01', // deadlock_detected
]);

const TRANSIENT_ERROR_NAMES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT']);

interface RetryOptions {
  maxRetries?: number; // default 3
  baseDelayMs?: number; // default 100
  context?: string; // for logging
}

/** Retries a DB operation on transient failures with exponential backoff. */
export async function withDbRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 100, context = 'db_operation' } = options;

  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      if (attempt >= maxRetries || !isTransient(error)) throw error;

      const delayMs = baseDelayMs * Math.pow(2, attempt);
      logger.warn('db_retry_attempt', {
        context,
        attempt: attempt + 1,
        maxRetries,
        delayMs,
        error: error instanceof Error ? error.message : String(error),
      });
      await sleep(delayMs);
    }
  }
}

/** Returns true if the error is a transient PostgreSQL or network failure. */
export function isTransient(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code =
    'code' in error && typeof (error as { code: unknown }).code === 'string'
      ? (error as { code: string }).code
      : undefined;
  if (code && TRANSIENT_PG_CODES.has(code)) return true;
  if (TRANSIENT_ERROR_NAMES.has(error.name)) return true;
  if (code && TRANSIENT_ERROR_NAMES.has(code)) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
