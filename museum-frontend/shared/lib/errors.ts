import type { AppError } from '@/shared/types/AppError';

/** A translate function compatible with i18next's `t()`. */
type TranslateFn = (key: string, opts?: { defaultValue: string }) => string;

let _translate: TranslateFn | null = null;

/**
 * Registers the i18n translate function for error messages.
 * Called once at app startup after i18n initialisation.
 * @param fn - The i18next `t` function (bound to the i18n instance).
 */
export const setErrorTranslate = (fn: TranslateFn): void => {
  _translate = fn;
};

/** Translates a key with a hardcoded English fallback when i18n is unavailable. */
const t = (key: string, defaultValue: string): string => {
  if (_translate) {
    return _translate(key, { defaultValue });
  }
  return defaultValue;
};

/**
 * Runtime type guard for {@link AppError}.
 * @param error - Unknown value to check.
 * @returns `true` if the value has the `kind` and `message` properties of an `AppError`.
 */
export const isAppError = (error: unknown): error is AppError => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  return 'kind' in error && 'message' in error;
};

/**
 * Extracts a user-facing error message from an unknown thrown value.
 * Returns a localized hint for known {@link AppError} kinds, falls back to a generic message otherwise.
 * @param error - The caught error value.
 * @returns A human-readable error string suitable for display.
 */
export const getErrorMessage = (error: unknown): string => {
  if (isAppError(error)) {
    switch (error.kind) {
      case 'Network':
        return t('error.network', 'Network unavailable. Check your connection and try again.');
      case 'Unauthorized':
        return t('error.unauthorized', 'Session expired. Please log in again.');
      case 'Forbidden':
        return t('error.forbidden', 'You do not have access to this action.');
      case 'NotFound':
        return t('error.notFound', 'Content not found.');
      case 'Validation':
        return t('error.validation', 'Please review your input and try again.');
      case 'RateLimited':
        return t('error.rateLimited', 'Too many requests. Please wait a moment.');
      case 'Timeout':
        return t('error.timeout', 'Request timed out. Please try again.');
      default:
        return error.message || t('error.unknown', 'Something went wrong. Please try again.');
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return t('error.unknown', 'Something went wrong. Please try again.');
};
