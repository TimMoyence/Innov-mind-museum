import { isAppError, getErrorMessage, setErrorTranslate } from '@/shared/lib/errors';
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
  });
});
