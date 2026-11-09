import * as Sentry from '@sentry/react-native';

import type { AppError } from '@/shared/types/AppError';
import { isAppError } from '@/shared/lib/errors';

const REPORTABLE_KINDS: ReadonlySet<string> = new Set([
  'Network',
  'Timeout',
  'Unknown',
  'Contract',
  'Streaming',
  'OfflinePack',
  'Location',
]);

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
  } catch {}
};
