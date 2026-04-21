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
 * Returns `true` when the error is a daily chat limit error (backend code `DAILY_LIMIT_REACHED`).
 * @param error - The caught error value.
 */
export const isDailyLimitError = (error: unknown): boolean => {
  if (isAppError(error) && error.kind === 'DailyLimitReached') return true;
  if (error instanceof Error && error.message.includes('DAILY_LIMIT_REACHED')) return true;
  return false;
};

const DEFAULT_SOCIAL_AUTH = 'Sign-in failed. Please try again.';
const DEFAULT_CONTRACT = 'Unexpected server response. Please try again.';
const DEFAULT_STREAMING = 'Live response unavailable, retrying in standard mode.';
const DEFAULT_LOCATION = 'Unable to determine your location.';
const DEFAULT_OFFLINE_PACK = 'Offline map download failed. Please retry.';
const DEFAULT_REVIEW = 'Unable to load reviews right now.';

const socialAuthMessage = (code: string | undefined): string => {
  switch (code) {
    case 'google_cancelled':
      return t('error.socialAuth.google_cancelled', 'Google sign-in cancelled.');
    case 'google_no_id_token':
      return t(
        'error.socialAuth.google_no_id_token',
        'Google sign-in could not complete. Please try again.',
      );
    case 'google_in_progress':
      return t('error.socialAuth.google_in_progress', 'Google sign-in is already running.');
    case 'apple_no_identity_token':
      return t(
        'error.socialAuth.apple_no_identity_token',
        'Apple sign-in was interrupted. Please try again.',
      );
    case 'ios_unavailable':
      return t(
        'error.socialAuth.ios_unavailable',
        'Google sign-in is unavailable on this build. Use Apple or email instead.',
      );
    default:
      return t('error.socialAuth.generic', DEFAULT_SOCIAL_AUTH);
  }
};

const contractMessage = (code: string | undefined): string => {
  switch (code) {
    case 'invalid':
      return t('error.chat.contract_invalid', DEFAULT_CONTRACT);
    case 'audio_missing':
      return t('error.chat.audio_missing', 'No audio to send.');
    default:
      return t('error.chat.contract_invalid', DEFAULT_CONTRACT);
  }
};

const streamingMessage = (code: string | undefined): string => {
  switch (code) {
    case 'unauthorized':
      return t('error.unauthorized', 'Session expired. Please log in again.');
    case 'unavailable':
    default:
      return t('error.chat.streaming_unavailable', DEFAULT_STREAMING);
  }
};

const locationMessage = (code: string | undefined): string => {
  switch (code) {
    case 'timeout':
      return t('error.location.timeout', 'Location lookup timed out.');
    case 'permission_denied':
      return t('error.location.permission_denied', 'Location permission denied.');
    default:
      return t('error.location.generic', DEFAULT_LOCATION);
  }
};

const offlinePackMessage = (code: string | undefined): string => {
  switch (code) {
    case 'download_failed':
    default:
      return t('error.offlinePack.download_failed', DEFAULT_OFFLINE_PACK);
  }
};

const reviewMessage = (code: string | undefined): string => {
  switch (code) {
    case 'load_failed':
      return t('error.review.load_failed', 'Failed to load reviews.');
    case 'load_more_failed':
      return t('error.review.load_more_failed', 'Failed to load more reviews.');
    case 'already_reviewed':
      return t('error.review.already_reviewed', 'You have already submitted a review.');
    case 'submit_failed':
      return t('error.review.submit_failed', 'Review submission failed. Please try again.');
    default:
      return t('error.review.generic', DEFAULT_REVIEW);
  }
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
      case 'DailyLimitReached':
        return t('error.dailyLimitReached', 'Daily message limit reached. Come back tomorrow!');
      case 'Timeout':
        return t('error.timeout', 'Request timed out. Please try again.');
      case 'SocialAuth':
        return socialAuthMessage(error.code);
      case 'Contract':
        return contractMessage(error.code);
      case 'Streaming':
        return streamingMessage(error.code);
      case 'Location':
        return locationMessage(error.code);
      case 'OfflinePack':
        return offlinePackMessage(error.code);
      case 'Review':
        return reviewMessage(error.code);
      default:
        return error.message || t('error.unknown', 'Something went wrong. Please try again.');
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return t('error.unknown', 'Something went wrong. Please try again.');
};
