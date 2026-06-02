/**
 * W1-GZIP-04 (RED) — gzipped-request round-trip through the REAL app pipeline.
 *
 * spec.md §Acceptance:
 *   BE e2e gzipped-request round-trip (real createApp); over-cap → 413.
 *
 * design.md §Architecture:
 *   Decompression middleware mounted after compression, before express.json,
 *   so a gzip-encoded JSON request body is inflated and parsed into req.body
 *   before any route runs; an over-cap bomb is rejected 413 with the standard
 *   error envelope { error: { code: 'PAYLOAD_TOO_LARGE' } }.
 *
 * Strategy — deterministic, no Postgres / RUN_INTEGRATION:
 *   Real `createApp()` mounts the full middleware stack including the new
 *   decompression middleware. We POST to a real public JSON route
 *   (`/api/leads/beta`) whose Zod `validateBody` runs purely in-process (no DB
 *   reached for a schema-invalid body).
 *   - A gzip-encoded VALID-JSON-but-schema-invalid body (missing `consent`)
 *     must reach `validateBody` and return 400 BAD_REQUEST. This proves the
 *     body was both DECOMPRESSED (else 415 / parse error) and PARSED by
 *     express.json into a structured object (else `req.body` undefined →
 *     different failure). The error references the missing `consent` field.
 *   - A gzip bomb inflating past the 1 MiB cap is rejected 413
 *     PAYLOAD_TOO_LARGE by the decompression middleware BEFORE the route runs.
 *
 * RED state: decompression middleware absent → gzip body is NOT inflated →
 *   express.json sees raw gzip bytes → 400 entity.parse.failed (not the
 *   consent validation error) for case 1; the bomb is NOT capped → no 413
 *   PAYLOAD_TOO_LARGE from streaming decompression for case 2.
 *
 * Frozen-test invariant: byte-immutable once manifested (phase=green).
 */

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
    // Valid JSON, but schema-invalid (consent missing) → validateBody 400.
    const payload = JSON.stringify({ email: 'edge@example.com' });
    const gz = gzipSync(Buffer.from(payload, 'utf-8'));

    const res = await request(app)
      .post('/api/leads/beta')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'gzip')
      // Identity serializer: keep Content-Type application/json on the wire (so
      // express.json parses the inflated body downstream) WITHOUT letting
      // superagent JSON-re-serialize the gzip Buffer into {"type":"Buffer",…}.
      // The wire body must be the RAW gzip bytes for the middleware to inflate.
      .serialize((value) => value)
      .send(gz);

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('BAD_REQUEST');
    // The validator (not a JSON-parse failure) ran — it names the missing field.
    expect(JSON.stringify(res.body)).toMatch(/consent/i);
  });

  it('rejects an over-cap gzip bomb with 413 PAYLOAD_TOO_LARGE before the route runs', async () => {
    // 16 MiB of zeros → gzips to a few KB; inflates to 16× the 1 MiB cap.
    const bomb = gzipSync(Buffer.alloc(16 * 1024 * 1024, 0));

    const res = await request(app)
      .post('/api/leads/beta')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'gzip')
      // Identity serializer: send the RAW gzip-bomb bytes on the wire (not a
      // JSON re-serialization of the Buffer) so the middleware actually inflates
      // and hits the streaming cap.
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
      // Identity serializer: send raw bytes on the wire (consistent with the
      // other cases). The unknown encoding is rejected 415 before any inflate.
      .serialize((value) => value)
      .send(gz);

    expect(res.status).toBe(415);
    expect(res.body?.error?.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });
});
