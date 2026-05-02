import {
  getErrorMessage,
  isAppError,
  isDailyLimitError,
  setErrorTranslate,
} from '@/shared/lib/errors';
import type { AppError } from '@/shared/types/AppError';

describe('errors', () => {
  // Reset translate function between tests
  afterEach(() => {
    setErrorTranslate(null as never);
  });

  describe('isAppError', () => {
    it('returns true for valid AppError', () => {
      const err: AppError = { kind: 'Network', message: 'Offline' };
      expect(isAppError(err)).toBe(true);
    });

    it('returns false for null', () => {
      expect(isAppError(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isAppError(undefined)).toBe(false);
    });

    it('returns false for plain object missing kind', () => {
      expect(isAppError({ message: 'hi' })).toBe(false);
    });

    it('returns false for plain object missing message', () => {
      expect(isAppError({ kind: 'Network' })).toBe(false);
    });

    it('returns false for primitive values', () => {
      expect(isAppError('string')).toBe(false);
      expect(isAppError(42)).toBe(false);
      expect(isAppError(true)).toBe(false);
    });

    it('returns true when both kind and message are present', () => {
      expect(isAppError({ kind: 'Unknown', message: 'oops' })).toBe(true);
    });
  });

  describe('getErrorMessage', () => {
    it('returns network message for Network kind', () => {
      const err: AppError = { kind: 'Network', message: '' };
      expect(getErrorMessage(err)).toBe(
        'Network unavailable. Check your connection and try again.',
      );
    });

    it('returns unauthorized message for Unauthorized kind', () => {
      const err: AppError = { kind: 'Unauthorized', message: '' };
      expect(getErrorMessage(err)).toBe('Session expired. Please log in again.');
    });

    it('returns forbidden message for Forbidden kind', () => {
      const err: AppError = { kind: 'Forbidden', message: '' };
      expect(getErrorMessage(err)).toBe('You do not have access to this action.');
    });

    it('returns not found message for NotFound kind', () => {
      const err: AppError = { kind: 'NotFound', message: '' };
      expect(getErrorMessage(err)).toBe('Content not found.');
    });

    it('returns validation message for Validation kind', () => {
      const err: AppError = { kind: 'Validation', message: '' };
      expect(getErrorMessage(err)).toBe('Please review your input and try again.');
    });

    it('returns rate limited message for RateLimited kind', () => {
      const err: AppError = { kind: 'RateLimited', message: '' };
      expect(getErrorMessage(err)).toBe('Too many requests. Please wait a moment.');
    });

    it('returns timeout message for Timeout kind', () => {
      const err: AppError = { kind: 'Timeout', message: '' };
      expect(getErrorMessage(err)).toBe('Request timed out. Please try again.');
    });

    it('returns error.message for plain Error', () => {
      const err = new Error('Something specific broke');
      expect(getErrorMessage(err)).toBe('Something specific broke');
    });

    it('returns generic fallback for non-Error/non-AppError', () => {
      expect(getErrorMessage('some string')).toBe('Something went wrong. Please try again.');
      expect(getErrorMessage(42)).toBe('Something went wrong. Please try again.');
    });

    it('uses custom translate function when set', () => {
      setErrorTranslate((key, opts) => `[translated] ${key} (${opts?.defaultValue})`);

      const err: AppError = { kind: 'Network', message: '' };
      expect(getErrorMessage(err)).toContain('[translated]');
      expect(getErrorMessage(err)).toContain('error.network');
    });

    it('returns DailyLimitReached message for DailyLimitReached kind', () => {
      const err: AppError = { kind: 'DailyLimitReached', message: '' };
      expect(getErrorMessage(err)).toBe('Daily message limit reached. Come back tomorrow!');
    });

    it('returns error.message for unknown AppError kind when message is non-empty', () => {
      const err = { kind: 'Mystery', message: 'specific bespoke detail' } as unknown as AppError;
      expect(getErrorMessage(err)).toBe('specific bespoke detail');
    });

    it('returns generic fallback for unknown AppError kind when message is empty', () => {
      const err = { kind: 'Mystery', message: '' } as unknown as AppError;
      expect(getErrorMessage(err)).toBe('Something went wrong. Please try again.');
    });
  });

  describe('isDailyLimitError', () => {
    it('returns true for AppError of kind DailyLimitReached', () => {
      const err: AppError = { kind: 'DailyLimitReached', message: '' };
      expect(isDailyLimitError(err)).toBe(true);
    });

    it('returns true for plain Error with DAILY_LIMIT_REACHED in message', () => {
      expect(isDailyLimitError(new Error('Server: DAILY_LIMIT_REACHED — try tomorrow'))).toBe(true);
    });

    it('returns false for AppError of other kinds', () => {
      expect(isDailyLimitError({ kind: 'Network', message: '' } satisfies AppError)).toBe(false);
    });

    it('returns false for plain Error without the sentinel string', () => {
      expect(isDailyLimitError(new Error('rate limited'))).toBe(false);
    });

    it('returns false for non-error values', () => {
      expect(isDailyLimitError(null)).toBe(false);
      expect(isDailyLimitError(undefined)).toBe(false);
      expect(isDailyLimitError('DAILY_LIMIT_REACHED')).toBe(false);
    });
  });

  describe('getErrorMessage — coded sub-categories', () => {
    const make = (kind: AppError['kind'], code: string): AppError =>
      ({ kind, code, message: '' }) as AppError;

    describe('SocialAuth', () => {
      it.each([
        ['google_cancelled', 'Google sign-in cancelled.'],
        ['google_no_id_token', 'Google sign-in could not complete. Please try again.'],
        ['google_in_progress', 'Google sign-in is already running.'],
        [
          'google_play_services_unavailable',
          'Google Play Services unavailable. Update Play Services and try again.',
        ],
        [
          'google_developer_error',
          'Google sign-in is unavailable on this version. Use email or Apple in the meantime.',
        ],
        ['google_unknown', 'Sign-in failed. Please try again.'],
        ['apple_no_identity_token', 'Apple sign-in was interrupted. Please try again.'],
        [
          'ios_unavailable',
          'Google sign-in is unavailable on this build. Use Apple or email instead.',
        ],
      ])('code=%s → %s', (code, expected) => {
        expect(getErrorMessage(make('SocialAuth', code))).toBe(expected);
      });

      it('falls back to generic for unrecognised SocialAuth code', () => {
        expect(getErrorMessage(make('SocialAuth', 'definitely_not_a_known_code'))).toBe(
          'Sign-in failed. Please try again.',
        );
      });
    });

    describe('Contract', () => {
      it.each([
        ['invalid', 'Unexpected server response. Please try again.'],
        ['audio_missing', 'No audio to send.'],
      ])('code=%s → %s', (code, expected) => {
        expect(getErrorMessage(make('Contract', code))).toBe(expected);
      });

      it('falls back to invalid wording for unrecognised Contract code', () => {
        expect(getErrorMessage(make('Contract', 'huh'))).toBe(
          'Unexpected server response. Please try again.',
        );
      });
    });

    describe('Streaming', () => {
      it('code=unauthorized → unauthorized message', () => {
        expect(getErrorMessage(make('Streaming', 'unauthorized'))).toBe(
          'Session expired. Please log in again.',
        );
      });

      it('code=unavailable → fallback message', () => {
        expect(getErrorMessage(make('Streaming', 'unavailable'))).toBe(
          'Live response unavailable, retrying in standard mode.',
        );
      });

      it('default branch returns the unavailable message', () => {
        expect(getErrorMessage(make('Streaming', 'never-seen-before'))).toBe(
          'Live response unavailable, retrying in standard mode.',
        );
      });
    });

    describe('Location', () => {
      it.each([
        ['timeout', 'Location lookup timed out.'],
        ['permission_denied', 'Location permission denied.'],
      ])('code=%s → %s', (code, expected) => {
        expect(getErrorMessage(make('Location', code))).toBe(expected);
      });

      it('default branch returns the generic location message', () => {
        expect(getErrorMessage(make('Location', 'unknown'))).toBe(
          'Unable to determine your location.',
        );
      });
    });

    describe('OfflinePack', () => {
      it('code=download_failed → message', () => {
        expect(getErrorMessage(make('OfflinePack', 'download_failed'))).toBe(
          'Offline map download failed. Please retry.',
        );
      });

      it('default branch returns the same message', () => {
        expect(getErrorMessage(make('OfflinePack', 'something_else'))).toBe(
          'Offline map download failed. Please retry.',
        );
      });
    });

    describe('Review', () => {
      it.each([
        ['load_failed', 'Failed to load reviews.'],
        ['load_more_failed', 'Failed to load more reviews.'],
        ['already_reviewed', 'You have already submitted a review.'],
        ['submit_failed', 'Review submission failed. Please try again.'],
      ])('code=%s → %s', (code, expected) => {
        expect(getErrorMessage(make('Review', code))).toBe(expected);
      });

      it('default branch returns the generic review message', () => {
        expect(getErrorMessage(make('Review', 'mystery'))).toBe(
          'Unable to load reviews right now.',
        );
      });
    });
  });
});
