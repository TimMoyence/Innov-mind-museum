jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@src/config/env', () => ({
  env: {
    sentry: {
      dsn: 'https://test@sentry.example.com/0',
      environment: 'test',
      release: 'test-release',
      tracesSampleRate: 0,
      profileSessionSampleRate: 0,
    },
    langfuse: undefined,
  },
}));

jest.mock('@sentry/node', () => {
  const setTag = jest.fn();
  const captureException = jest.fn();
  return {
    init: jest.fn(),
    withScope: (cb: (scope: { setTag: jest.Mock }) => void) => {
      cb({ setTag });
    },
    captureException,
    getDefaultIntegrationsWithoutPerformance: jest.fn(() => []),
    setupExpressErrorHandler: jest.fn(),
    startSpan: jest.fn(),
    setUser: jest.fn(),
    __mocks__: { setTag, captureException },
  };
});

import * as SentrySdk from '@sentry/node';

import {
  captureExceptionWithContext,
  initSentry,
  isSentryEnabled,
} from '@shared/observability/sentry';

const sentryMocks = (
  SentrySdk as unknown as {
    __mocks__: { setTag: jest.Mock; captureException: jest.Mock };
  }
).__mocks__;

describe('captureExceptionWithContext — R3 URL-like tag scrubbing', () => {
  beforeAll(() => {
    initSentry();
    expect(isSentryEnabled()).toBe(true);
  });

  beforeEach(() => {
    sentryMocks.setTag.mockClear();
    sentryMocks.captureException.mockClear();
  });

  it('scrubs sensitive query-params in URL-like tag values before setTag (R3)', () => {
    captureExceptionWithContext(new Error('boom'), {
      path: '/api/auth/magic-link?code=ABC&email=u@x.tld',
      method: 'GET',
      requestId: 'rq-2',
    });

    expect(sentryMocks.setTag).toHaveBeenCalledWith(
      'path',
      '/api/auth/magic-link?code=[redacted]&email=[redacted]',
    );
    expect(sentryMocks.setTag).toHaveBeenCalledWith('method', 'GET');
    expect(sentryMocks.setTag).toHaveBeenCalledWith('requestId', 'rq-2');
  });

  it('does NOT modify non-URL-like tag values (no false positives)', () => {
    captureExceptionWithContext(new Error('boom'), {
      method: 'POST',
      requestId: 'plain-string-no-url',
      statusCode: '500',
    });

    expect(sentryMocks.setTag).toHaveBeenCalledWith('method', 'POST');
    expect(sentryMocks.setTag).toHaveBeenCalledWith('requestId', 'plain-string-no-url');
    expect(sentryMocks.setTag).toHaveBeenCalledWith('statusCode', '500');
  });

  it('skips undefined context values (existing :84 invariant preserved)', () => {
    captureExceptionWithContext(new Error('boom'), {
      path: undefined,
      method: 'GET',
    });

    const pathCalls = sentryMocks.setTag.mock.calls.filter(([key]) => key === 'path');
    expect(pathCalls).toHaveLength(0);

    expect(sentryMocks.setTag).toHaveBeenCalledWith('method', 'GET');
  });

  it('calls Sentry.captureException once with the original error', () => {
    const err = new Error('boom');
    captureExceptionWithContext(err, {
      path: '/api/x?token=secret',
    });

    expect(sentryMocks.captureException).toHaveBeenCalledTimes(1);
    expect(sentryMocks.captureException).toHaveBeenCalledWith(err);
  });

  it('handles all sensitive keys together (code/state/email/phone)', () => {
    captureExceptionWithContext(new Error('boom'), {
      path: '/api/auth/x?code=ABC&state=XYZ&email=u@x.tld&phone=%2B33612345678&keep=ok',
    });

    expect(sentryMocks.setTag).toHaveBeenCalledWith(
      'path',
      '/api/auth/x?code=[redacted]&state=[redacted]&email=[redacted]&phone=[redacted]&keep=ok',
    );
  });
});
