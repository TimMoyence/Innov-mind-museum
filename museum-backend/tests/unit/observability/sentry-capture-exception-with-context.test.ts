/**
 * R3 — captureExceptionWithContext MUST scrub URL-like tag values BEFORE
 * scope.setTag is invoked. The only BE site that setTag dynamically today is
 * error.middleware.ts (`path: req.originalUrl`), which sends raw query-strings
 * to Sentry tags (indexed + persistent for 30 days). This test pins the
 * defense-in-depth source scrub upstream of scrubEvent's tag traversal.
 *
 * Pattern follows tests/unit/middleware/error-handler.test.ts (jest.mock the
 * Sentry module + spy on setTag inside withScope callback).
 *
 * RED: today the wrapper passes `req.originalUrl` straight to setTag — these
 * assertions FAIL. GREEN: scrubUrl runs on URL-like context values before
 * setTag.
 */

// Silence logger output during tests
jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// Mock env so initSentry has a configured DSN — otherwise isSentryEnabled
// stays false and captureExceptionWithContext returns early without calling
// Sentry (the wrapper has an explicit `if (!initialized) return`).
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

// Mock @sentry/node — capture withScope callback + setTag invocations.
// Factory uses inline functions (jest hoists jest.mock above imports — closure
// variables are not in scope yet, so we expose mocks via the module itself).
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
    // expose for assertions
    __mocks__: { setTag, captureException },
  };
});

import * as SentrySdk from '@sentry/node';

import {
  captureExceptionWithContext,
  initSentry,
  isSentryEnabled,
} from '@shared/observability/sentry';

// Retrieve the spies exposed by the factory.
const sentryMocks = (
  SentrySdk as unknown as {
    __mocks__: { setTag: jest.Mock; captureException: jest.Mock };
  }
).__mocks__;

describe('captureExceptionWithContext — R3 URL-like tag scrubbing', () => {
  beforeAll(() => {
    // Initialise so the `if (!initialized) return` early-exit gate is open.
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

    // None of these look like URLs (no leading slash, no ?, no http).
    expect(sentryMocks.setTag).toHaveBeenCalledWith('method', 'POST');
    expect(sentryMocks.setTag).toHaveBeenCalledWith('requestId', 'plain-string-no-url');
    expect(sentryMocks.setTag).toHaveBeenCalledWith('statusCode', '500');
  });

  it('skips undefined context values (existing :84 invariant preserved)', () => {
    captureExceptionWithContext(new Error('boom'), {
      path: undefined,
      method: 'GET',
    });

    // path = undefined → setTag NEVER called with key='path'.
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
