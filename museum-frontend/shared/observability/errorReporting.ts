import * as Sentry from '@sentry/react-native';

import type { AppError } from '@/shared/types/AppError';
import { isAppError } from '@/shared/lib/errors';

/** Error kinds that represent operational issues worth reporting to Sentry. */
const REPORTABLE_KINDS: ReadonlySet<string> = new Set([
  'Network',
  'Timeout',
  'Unknown',
  'Contract',
  'Streaming',
  'OfflinePack',
  'Location',
]);

/**
 * Reports an error to Sentry if it represents an operational failure.
 * User-facing errors (Validation, Forbidden, NotFound, Unauthorized, RateLimited)
 * are intentionally NOT reported to avoid noise.
 * Includes a dedup guard (`_reported`) to prevent double-capture when the same
 * error is caught by both the HTTP interceptor and a component error handler.
 * @param error - The caught error value.
 * @param context - Optional key/value pairs attached as Sentry extras.
 */
export const reportError = (error: unknown, context?: Record<string, string>): void => {
  try {
    if (!Sentry.getClient()) return;

    const appError: AppError | null = isAppError(error) ? error : null;

    if (appError?._reported) return;

    if (appError && !REPORTABLE_KINDS.has(appError.kind)) return;

    if (appError) appError._reported = true;

    Sentry.captureException(error, {
      extra: {
        ...context,
        ...(appError
          ? {
              errorKind: appError.kind,
              errorStatus: String(appError.status ?? ''),
              requestId: appError.requestId ?? '',
            }
          : {}),
      },
    });
  } catch {
    // Never let error reporting itself throw
  }
};
