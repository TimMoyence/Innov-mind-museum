import { Readable } from 'node:stream';
import { gzipSync, brotliCompressSync } from 'node:zlib';

import { AppError } from '@shared/errors/app.error';
import { env } from '@src/config/env';
import { requestDecompressionMiddleware } from '@shared/middleware/request-decompression.middleware';

import type { Request, Response, NextFunction } from 'express';

function parseLimitToBytes(limit: string): number {
  const match = /^([0-9.]+)(b|kb|mb|gb)?$/i.exec(limit.trim().toLowerCase());
  if (!match) return Number(limit) || 0;
  const value = Number(match[1]);
  switch (match[2]) {
    case 'gb':
      return Math.floor(value * 1024 * 1024 * 1024);
    case 'mb':
      return Math.floor(value * 1024 * 1024);
    case 'kb':
      return Math.floor(value * 1024);
    default:
      return Math.floor(value);
  }
}

const CAP_BYTES = parseLimitToBytes(env.jsonBodyLimit);

function makeStreamRequest(payload: Buffer, headers: Record<string, string>): Request {
  const readable = Readable.from([payload]) as unknown as Request & Readable;
  readable.headers = headers;
  readable.method = 'POST';
  readable.url = '/api/anything';
  return readable as unknown as Request;
}

const mockRes = (): Response => ({}) as Response;

interface DrainResult {
  bytesReachedDownstream: number;
  errored: boolean;
}

async function drainCounting(req: Request): Promise<DrainResult> {
  let bytesReachedDownstream = 0;
  let errored = false;
  try {
    for await (const chunk of req as unknown as AsyncIterable<Buffer>) {
      bytesReachedDownstream += chunk.length;
      if (bytesReachedDownstream > CAP_BYTES * 8) break;
    }
  } catch {
    errored = true;
  }
  return { bytesReachedDownstream, errored };
}

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('requestDecompressionMiddleware streaming zip-bomb cap (W1-GZIP-02)', () => {
  it('asserts the cap is derived from env.jsonBodyLimit = 1 MiB', () => {
    expect(CAP_BYTES).toBe(1024 * 1024);
  });

  it('R4 — gzip bomb inflating >1 MiB → next(413) and downstream bytes stay bounded near the cap', async () => {
    const bombPlain = Buffer.alloc(16 * 1024 * 1024, 0);
    const bombGz = gzipSync(bombPlain);
    expect(bombGz.length).toBeLessThan(CAP_BYTES);

    const req = makeStreamRequest(bombGz, { 'content-encoding': 'gzip' });
    const next = jest.fn() as NextFunction;

    requestDecompressionMiddleware(req, mockRes(), next);

    const drain = drainCounting(req);
    await flush();
    const { bytesReachedDownstream } = await drain;

    const errorArgs = (next as jest.Mock).mock.calls
      .map((call) => call[0] as unknown)
      .filter((arg): arg is AppError => arg instanceof AppError);
    expect(errorArgs).toHaveLength(1);
    const error = errorArgs[0];
    expect(error.statusCode).toBe(413);
    expect(error.code).toBe('PAYLOAD_TOO_LARGE');

    expect(bytesReachedDownstream).toBeLessThanOrEqual(CAP_BYTES + 256 * 1024);
    expect(bytesReachedDownstream).toBeLessThan(bombPlain.length);
  });

  it('R4 — brotli bomb inflating >1 MiB → next(413) PAYLOAD_TOO_LARGE', async () => {
    const bombPlain = Buffer.alloc(16 * 1024 * 1024, 0);
    const bombBr = brotliCompressSync(bombPlain);

    const req = makeStreamRequest(bombBr, { 'content-encoding': 'br' });
    const next = jest.fn() as NextFunction;

    requestDecompressionMiddleware(req, mockRes(), next);

    const drain = drainCounting(req);
    await flush();
    await drain;

    const errorArgs = (next as jest.Mock).mock.calls
      .map((call) => call[0] as unknown)
      .filter((arg): arg is AppError => arg instanceof AppError);
    expect(errorArgs).toHaveLength(1);
    const error = errorArgs[0];
    expect(error.statusCode).toBe(413);
    expect(error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('R4 — payload that inflates to ≤ cap → success (no error), full body delivered', async () => {
    const safePlain = Buffer.from(JSON.stringify({ blob: 'x'.repeat(512 * 1024) }), 'utf-8');
    const safeGz = gzipSync(safePlain);

    const req = makeStreamRequest(safeGz, { 'content-encoding': 'gzip' });
    const next = jest.fn() as NextFunction;

    requestDecompressionMiddleware(req, mockRes(), next);

    const drain = drainCounting(req);
    await flush();
    const { bytesReachedDownstream, errored } = await drain;

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
    expect(errored).toBe(false);
    expect(bytesReachedDownstream).toBe(safePlain.length);
  });
});
