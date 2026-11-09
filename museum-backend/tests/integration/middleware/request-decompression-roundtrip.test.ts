import { gzipSync } from 'node:zlib';

import request from 'supertest';

import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';

const { app } = createRouteTestApp();

describe('request decompression round-trip [integration] (W1-GZIP-04)', () => {
  beforeEach(() => {
    resetRateLimits();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it('inflates a gzip JSON body so the route validator sees the parsed object', async () => {
    const payload = JSON.stringify({ email: 'edge@example.com' });
    const gz = gzipSync(Buffer.from(payload, 'utf-8'));

    const res = await request(app)
      .post('/api/leads/beta')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'gzip')
      .serialize((value) => value)
      .send(gz);

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('BAD_REQUEST');
    expect(JSON.stringify(res.body)).toMatch(/consent/i);
  });

  it('rejects an over-cap gzip bomb with 413 PAYLOAD_TOO_LARGE before the route runs', async () => {
    const bomb = gzipSync(Buffer.alloc(16 * 1024 * 1024, 0));

    const res = await request(app)
      .post('/api/leads/beta')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'gzip')
      .serialize((value) => value)
      .send(bomb);

    expect(res.status).toBe(413);
    expect(res.body?.error?.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('rejects an unknown Content-Encoding with 415 UNSUPPORTED_MEDIA_TYPE', async () => {
    const gz = gzipSync(Buffer.from(JSON.stringify({ email: 'a@b.co', consent: true }), 'utf-8'));

    const res = await request(app)
      .post('/api/leads/beta')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'snappy')
      .serialize((value) => value)
      .send(gz);

    expect(res.status).toBe(415);
    expect(res.body?.error?.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });
});
