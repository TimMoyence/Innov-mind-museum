/**
 * F11 (2026-04-30) — Request logger must redact sensitive query-string keys
 * before writing to logs (mirrors sentry-scrubber.ts redaction list).
 *
 * Pre-fix: req.originalUrl logged verbatim — `?token=abc&password=xyz` survived
 * to log files. Post-fix: same redaction set as Sentry transport, single source
 * of truth via SENSITIVE_QUERY_KEYS export.
 */
import express from 'express';
import request from 'supertest';

import { logger } from '@shared/logger/logger';
import { requestLoggerMiddleware } from '@src/helpers/middleware/request-logger.middleware';

jest.mock('@shared/logger/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const buildApp = () => {
  const app = express();
  app.use(requestLoggerMiddleware);
  app.get('/api/anything', (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return app;
};

describe('F11 — request logger query-string redaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const findHttpLog = (): Record<string, unknown> | undefined => {
    const calls = (logger.info as jest.Mock).mock.calls;
    const httpCall = calls.find(([msg]) => msg === 'http_request');
    return httpCall?.[1] as Record<string, unknown> | undefined;
  };

  it('redacts ?token=… in originalUrl', async () => {
    await request(buildApp()).get('/api/anything?token=abc-secret');
    const log = findHttpLog();
    expect(log?.path).toBe('/api/anything?token=[redacted]');
  });

  it('redacts ?password=… (and other sensitive keys)', async () => {
    await request(buildApp()).get('/api/anything?password=hunter2&access_token=xx&api_key=yy');
    const log = findHttpLog();
    expect(log?.path).toMatch(/password=\[redacted\]/);
    expect(log?.path).toMatch(/access_token=\[redacted\]/);
    expect(log?.path).toMatch(/api_key=\[redacted\]/);
  });

  it('preserves non-sensitive query keys verbatim', async () => {
    await request(buildApp()).get('/api/anything?lang=fr&page=2&token=secret');
    const log = findHttpLog();
    expect(log?.path).toMatch(/lang=fr/);
    expect(log?.path).toMatch(/page=2/);
    expect(log?.path).toMatch(/token=\[redacted\]/);
  });

  it('passes paths without a querystring through unchanged', async () => {
    await request(buildApp()).get('/api/anything');
    const log = findHttpLog();
    expect(log?.path).toBe('/api/anything');
  });

  it('does not log /api/health (silent path)', async () => {
    const app = express();
    app.use(requestLoggerMiddleware);
    app.get('/api/health', (_req, res) => {
      res.status(200).json({ ok: true });
    });
    // Silent path matches exactly, so bare /api/health stays out of the log.
    // (A hardening follow-up could canonicalise the path before the silent check
    // so /api/health?foo=bar also stays silent — out of scope for F11.)
    await request(app).get('/api/health');
    expect(logger.info).not.toHaveBeenCalledWith('http_request', expect.anything());
  });
});
