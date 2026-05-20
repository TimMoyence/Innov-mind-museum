/**
 * TD-MUL-01 integration test — multer `limits.fields` enforcement.
 *
 * Acceptance batch L #2 : a POST exceeding the configured `fields` limit
 * (11 fields against `fields: 10`) MUST surface as HTTP 413 PAYLOAD_TOO_LARGE,
 * not 400 BAD_REQUEST nor 500. Wires a real multer middleware into a real
 * Express app and drives it via supertest — exercises the full path multer
 * MulterError → error.middleware → response, the same path production hits.
 */

import express from 'express';
import multer from 'multer';
import request from 'supertest';

import { errorHandler } from '@shared/middleware/error.middleware';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@shared/observability/sentry', () => ({
  captureExceptionWithContext: jest.fn(),
}));

/** Minimal app : in-memory multer with the same DoS bounds Musaium ships. */
function buildApp() {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fields: 10, parts: 20, headerPairs: 50, fileSize: 1024 * 1024 },
  });
  const app = express();
  app.post('/upload', upload.none(), (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.use(errorHandler);
  return app;
}

describe('multer fields limit → 413 (TD-MUL-01)', () => {
  it('returns 413 PAYLOAD_TOO_LARGE when 11 form fields are posted (limit=10)', async () => {
    const app = buildApp();
    const req = request(app).post('/upload');
    // Build exactly 11 distinct non-file fields → trips LIMIT_FIELD_COUNT.
    for (let i = 0; i < 11; i += 1) {
      req.field(`f${String(i)}`, `v${String(i)}`);
    }
    const res = await req;

    expect(res.status).toBe(413);
    expect(res.body).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Too many fields',
        }),
      }),
    );
  });

  it('accepts 10 fields (at the limit)', async () => {
    const app = buildApp();
    const req = request(app).post('/upload');
    for (let i = 0; i < 10; i += 1) {
      req.field(`f${String(i)}`, `v${String(i)}`);
    }
    const res = await req;

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
