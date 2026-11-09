import express from 'express';
import request from 'supertest';

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

import { errorHandler } from '@shared/middleware/error.middleware';
import { initSentry } from '@shared/observability/sentry';

const sentryMocks = (
  SentrySdk as unknown as {
    __mocks__: { setTag: jest.Mock; captureException: jest.Mock };
  }
).__mocks__;

const buildApp = () => {
  const app = express();
  app.get('/api/test-error-500', (_req, _res, next) => {
    next(new Error('synthetic 5xx for R4'));
  });
  app.use(errorHandler);
  return app;
};

describe('error-middleware → Sentry tags scrubbing — R4 integration', () => {
  beforeAll(() => {
    initSentry();
  });

  beforeEach(() => {
    sentryMocks.setTag.mockClear();
    sentryMocks.captureException.mockClear();
  });

  it('scrubs all sensitive query-string params in scope.tags.path (R4)', async () => {
    const app = buildApp();
    await request(app).get('/api/test-error-500?code=ABC&password=secret&state=XYZ&email=u@x.tld');

    expect(sentryMocks.captureException).toHaveBeenCalledTimes(1);

    expect(sentryMocks.setTag).toHaveBeenCalledWith(
      'path',
      '/api/test-error-500?code=[redacted]&password=[redacted]&state=[redacted]&email=[redacted]',
    );

    expect(sentryMocks.setTag).toHaveBeenCalledWith('method', 'GET');
  });

  it('skips path tag when route has no query-string (defense-in-depth no-op)', async () => {
    const app = buildApp();
    await request(app).get('/api/test-error-500');

    expect(sentryMocks.setTag).toHaveBeenCalledWith('path', '/api/test-error-500');
    expect(sentryMocks.setTag).toHaveBeenCalledWith('method', 'GET');
  });
});
