import { Readable } from 'node:stream';
import { gzipSync, deflateSync, brotliCompressSync } from 'node:zlib';

import { AppError } from '@shared/errors/app.error';
import { requestDecompressionMiddleware } from '@shared/middleware/request-decompression.middleware';

import type { Request, Response, NextFunction } from 'express';

function makeStreamRequest(payload: Buffer, headers: Record<string, string>): Request {
  const readable = Readable.from([payload]) as unknown as Request & Readable;
  readable.headers = headers;
  readable.method = 'POST';
  readable.url = '/api/anything';
  return readable as unknown as Request;
}

const mockRes = (): Response => ({}) as Response;

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
