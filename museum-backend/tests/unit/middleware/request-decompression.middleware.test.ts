/**
 * W1-GZIP-01 (RED) — requestDecompressionMiddleware unit test.
 *
 * spec.md §EARS:
 *   R1 — Content-Encoding gzip|deflate|br → middleware inflates so express.json
 *        parses the original object.
 *   R2 — no Content-Encoding → next() untouched (zero overhead, body stream
 *        is left exactly as received).
 *   R3 — unknown encoding (e.g. snappy) → next(AppError 415 UNSUPPORTED_MEDIA_TYPE).
 *
 * design.md §Architecture:
 *   BE `requestDecompressionMiddleware` (NEW, prod-safe): if Content-Encoding
 *   gzip|deflate|br → inflate via node:zlib (createGunzip/createInflate/
 *   createBrotliDecompress); replace req readable (PassThrough) so express.json
 *   reads inflated bytes; unknown encoding → next(AppError 415); no header →
 *   next() untouched.
 *
 * RED state: `@shared/middleware/request-decompression.middleware` does not
 * exist yet → import throws / middleware absent → every assertion fails.
 *
 * Fixtures use node:zlib built-in (BE, no dep) per design.md §Discipline.
 * The fake req is a Readable that emits the (already-compressed) body bytes;
 * the middleware is expected to swap req's readable surface with the inflated
 * stream, which we drain to reconstruct the original JSON.
 *
 * Frozen-test invariant: this file is byte-immutable once manifested (phase=green).
 */

import { Readable } from 'node:stream';
import { gzipSync, deflateSync, brotliCompressSync } from 'node:zlib';

import { AppError } from '@shared/errors/app.error';
import { requestDecompressionMiddleware } from '@shared/middleware/request-decompression.middleware';

import type { Request, Response, NextFunction } from 'express';

/**
 * Builds a fake Express Request that is also a Readable stream emitting
 * `payload` as its body. `headers` are lowercased per Node's IncomingMessage.
 * @param payload - raw (possibly compressed) request body bytes
 * @param headers - request headers (e.g. content-encoding)
 * @returns a fake Express Request backed by a Readable
 */
function makeStreamRequest(payload: Buffer, headers: Record<string, string>): Request {
  const readable = Readable.from([payload]) as unknown as Request & Readable;
  readable.headers = headers;
  readable.method = 'POST';
  readable.url = '/api/anything';
  return readable as unknown as Request;
}

const mockRes = (): Response => ({}) as Response;

/**
 * Drains whatever readable surface the middleware left on `req` back into a
 * single Buffer so we can assert the inflated bytes equal the original JSON.
 * @param req - the request object after the middleware ran
 * @returns the concatenated body bytes
 */
async function drainBody(req: Request): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req as unknown as AsyncIterable<Buffer>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

describe('requestDecompressionMiddleware (W1-GZIP-01)', () => {
  const originalObject = { hello: 'world', nested: { count: 3 }, list: [1, 2, 3] };
  const originalJson = JSON.stringify(originalObject);
  const originalBytes = Buffer.from(originalJson, 'utf-8');

  it('R1 — inflates a gzip-encoded body so express.json reads the original JSON', async () => {
    const req = makeStreamRequest(gzipSync(originalBytes), { 'content-encoding': 'gzip' });
    const next = jest.fn() as NextFunction;

    requestDecompressionMiddleware(req, mockRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();

    const inflated = await drainBody(req);
    expect(inflated.toString('utf-8')).toBe(originalJson);
    expect(JSON.parse(inflated.toString('utf-8'))).toEqual(originalObject);
  });

  it('R1 — inflates a deflate-encoded body', async () => {
    const req = makeStreamRequest(deflateSync(originalBytes), { 'content-encoding': 'deflate' });
    const next = jest.fn() as NextFunction;

    requestDecompressionMiddleware(req, mockRes(), next);

    expect(next).toHaveBeenCalledWith();
    const inflated = await drainBody(req);
    expect(inflated.toString('utf-8')).toBe(originalJson);
  });

  it('R1 — inflates a brotli-encoded body', async () => {
    const req = makeStreamRequest(brotliCompressSync(originalBytes), { 'content-encoding': 'br' });
    const next = jest.fn() as NextFunction;

    requestDecompressionMiddleware(req, mockRes(), next);

    expect(next).toHaveBeenCalledWith();
    const inflated = await drainBody(req);
    expect(inflated.toString('utf-8')).toBe(originalJson);
  });

  it('R2 — no Content-Encoding header → next() with no error, body untouched', async () => {
    const req = makeStreamRequest(originalBytes, {});
    const next = jest.fn() as NextFunction;

    requestDecompressionMiddleware(req, mockRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();

    const passthrough = await drainBody(req);
    expect(passthrough.toString('utf-8')).toBe(originalJson);
  });

  it('R2 — Content-Encoding identity → treated as no-op passthrough', async () => {
    const req = makeStreamRequest(originalBytes, { 'content-encoding': 'identity' });
    const next = jest.fn() as NextFunction;

    requestDecompressionMiddleware(req, mockRes(), next);

    expect(next).toHaveBeenCalledWith();
    const passthrough = await drainBody(req);
    expect(passthrough.toString('utf-8')).toBe(originalJson);
  });

  it('R3 — unknown encoding (snappy) → next(AppError 415 UNSUPPORTED_MEDIA_TYPE)', () => {
    const req = makeStreamRequest(gzipSync(originalBytes), { 'content-encoding': 'snappy' });
    const next = jest.fn() as NextFunction;

    requestDecompressionMiddleware(req, mockRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = (next as jest.Mock).mock.calls[0][0] as unknown;
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(415);
    expect((error as AppError).code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });
});
