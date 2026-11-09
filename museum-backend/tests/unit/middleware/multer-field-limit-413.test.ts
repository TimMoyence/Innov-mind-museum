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
