import * as Sentry from '@sentry/react-native';

jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
  getClient: jest.fn(() => ({})),
}));

import { reportError } from '@/shared/observability/errorReporting';
import type { AppError } from '@/shared/types/AppError';

describe('errorReporting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Sentry.getClient as jest.Mock).mockReturnValue({});
  });

  it('reports errors to Sentry', () => {
    const error = new Error('boom');
    reportError(error);

    expect(Sentry.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ extra: expect.any(Object) }),
    );
  });

  it('reports Network AppError to Sentry (reportable kind)', () => {
    const error: AppError = { kind: 'Network', message: 'Offline' };
    reportError(error);

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        extra: expect.objectContaining({ errorKind: 'Network' }),
      }),
    );
  });

  it('skips Validation errors (non-reportable)', () => {
    const error: AppError = { kind: 'Validation', message: 'Bad input' };
    reportError(error);

    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('skips Unauthorized errors (non-reportable)', () => {
    const error: AppError = { kind: 'Unauthorized', message: 'No session' };
    reportError(error);

    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('skips Forbidden errors (non-reportable)', () => {
    const error: AppError = { kind: 'Forbidden', message: 'Denied' };
    reportError(error);

    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('dedup guard prevents double-report', () => {
    const error: AppError = { kind: 'Timeout', message: 'Timed out' };
    reportError(error);
    reportError(error);

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('no-op when Sentry client is null', () => {
    (Sentry.getClient as jest.Mock).mockReturnValue(null);

    reportError(new Error('should not report'));

    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('attaches context as Sentry extras', () => {
    const error: AppError = {
      kind: 'Unknown',
      message: 'fail',
      status: 500,
      requestId: 'req-123',
    };
    reportError(error, { screen: 'HomeScreen' });

    expect(Sentry.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        extra: expect.objectContaining({
          screen: 'HomeScreen',
          errorKind: 'Unknown',
          errorStatus: '500',
          requestId: 'req-123',
        }),
      }),
    );
  });
});
