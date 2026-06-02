/**
 * W1-GZIP-02 (RED) — requestDecompressionMiddleware STREAMING zip-bomb cap.
 * LOAD-BEARING (security-critical).
 *
 * spec.md §EARS R4:
 *   WHEN inflated size > cap (bytes(jsonBodyLimit) = 1 MiB) THE middleware SHALL
 *   abort 413 BEFORE buffering the full payload (streaming counter, destroy stream).
 *
 * spec.md §NFR:
 *   streaming zip-bomb cap (no full materialization).
 *
 * design.md §Architecture:
 *   inflate via node:zlib with a STREAMING decompressed-byte counter capped at
 *   bytes(jsonBodyLimit); on breach destroy stream + next(AppError 413) BEFORE
 *   materializing full payload.
 *
 * The bomb: a small gzip/brotli input that inflates to FAR more than the cap
 * (here ~16 MiB of a single repeated byte → compresses to a few KB). A correct
 * implementation must NOT buffer all 16 MiB before deciding 413; it must abort
 * mid-inflate once the running counter crosses bytes(env.jsonBodyLimit) = 1 MiB.
 *
 * We instrument the destination side. The middleware swaps req's readable
 * surface with the inflated stream; downstream (express.json) drains it. We
 * stand in for express.json by draining the post-middleware req and tracking
 * the PEAK bytes that actually flowed downstream. On breach:
 *   - next() is called with an AppError {statusCode:413, code:'PAYLOAD_TOO_LARGE'}.
 *   - the bytes that reached downstream stay bounded near the cap (NOT 16 MiB),
 *     proving the inflate was aborted streaming-wise, not post-buffer.
 *
 * RED state: middleware module absent → import throws → assertions fail.
 *
 * Frozen-test invariant: byte-immutable once manifested (phase=green).
 */

import { Readable } from 'node:stream';
import { gzipSync, brotliCompressSync } from 'node:zlib';

import { AppError } from '@shared/errors/app.error';
import { env } from '@src/config/env';
import { requestDecompressionMiddleware } from '@shared/middleware/request-decompression.middleware';

import type { Request, Response, NextFunction } from 'express';

/**
 * Parses an express byte-limit string ('1mb') into a byte count, mirroring
 * the `bytes` package semantics used by express.json. Kept local to the test
 * so the assertion's cap is derived from the SAME env value the middleware
 * must honor (env.jsonBodyLimit), not a hard-coded magic number.
 * @param limit - e.g. '1mb', '512kb', or a raw byte count string
 * @returns the limit expressed in bytes (0 when unparseable)
 */
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

/**
 * Builds a fake Express Request that is also a Readable emitting `payload`.
 * @param payload - raw compressed body bytes
 * @param headers - request headers
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

interface DrainResult {
  bytesReachedDownstream: number;
  errored: boolean;
}

/**
 * Stands in for express.json: consumes whatever readable surface the middleware
 * left on `req`, counting how many decompressed bytes actually flowed
 * downstream. If the underlying stream is destroyed with an error mid-flight
 * we capture that instead of throwing, so the test can assert the bound.
 * @param req - request after the middleware ran
 * @returns bytes that reached downstream + whether the stream errored
 */
async function drainCounting(req: Request): Promise<DrainResult> {
  let bytesReachedDownstream = 0;
  let errored = false;
  try {
    for await (const chunk of req as unknown as AsyncIterable<Buffer>) {
      bytesReachedDownstream += chunk.length;
      // Defensive: if a broken impl never aborts, do not let the test OOM.
      if (bytesReachedDownstream > CAP_BYTES * 8) break;
    }
  } catch {
    errored = true;
  }
  return { bytesReachedDownstream, errored };
}

/**
 * Waits a microtask-ish tick so the middleware's async inflate pipeline has a
 * chance to call next() after wiring streams.
 * @returns a promise that resolves on the next macrotask
 */
const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('requestDecompressionMiddleware streaming zip-bomb cap (W1-GZIP-02)', () => {
  it('asserts the cap is derived from env.jsonBodyLimit = 1 MiB', () => {
    expect(CAP_BYTES).toBe(1024 * 1024);
  });

  it('R4 — gzip bomb inflating >1 MiB → next(413) and downstream bytes stay bounded near the cap', async () => {
    // 16 MiB of zeros → gzips to a few KB. Inflates to 16× the 1 MiB cap.
    const bombPlain = Buffer.alloc(16 * 1024 * 1024, 0);
    const bombGz = gzipSync(bombPlain);
    expect(bombGz.length).toBeLessThan(CAP_BYTES); // the compressed input itself is tiny

    const req = makeStreamRequest(bombGz, { 'content-encoding': 'gzip' });
    const next = jest.fn() as NextFunction;

    requestDecompressionMiddleware(req, mockRes(), next);

    const drain = drainCounting(req);
    await flush();
    const { bytesReachedDownstream } = await drain;

    // A 413 PAYLOAD_TOO_LARGE AppError is surfaced via next. The middleware
    // hands off synchronously (next() to let downstream drain the inflate) and
    // then, once the streaming counter crosses the cap, fires next(AppError 413)
    // asynchronously via the inflate's 'data' handler — so next is called more
    // than once and the error is NOT the sole first synchronous arg. Assert the
    // 413 is present AMONG the calls.
    const errorArgs = (next as jest.Mock).mock.calls
      .map((call) => call[0] as unknown)
      .filter((arg): arg is AppError => arg instanceof AppError);
    expect(errorArgs).toHaveLength(1);
    const error = errorArgs[0];
    expect(error.statusCode).toBe(413);
    expect(error.code).toBe('PAYLOAD_TOO_LARGE');

    // STREAMING proof: the 16 MiB bomb was NEVER fully materialized. The bytes
    // that reached downstream are bounded — allow one chunk of slack over the
    // cap (zlib emits in chunks), but FAR below the 16 MiB inflated size.
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

    // 413 surfaced AMONG the next calls (sync hand-off + async streaming abort),
    // not as the sole first synchronous arg.
    const errorArgs = (next as jest.Mock).mock.calls
      .map((call) => call[0] as unknown)
      .filter((arg): arg is AppError => arg instanceof AppError);
    expect(errorArgs).toHaveLength(1);
    const error = errorArgs[0];
    expect(error.statusCode).toBe(413);
    expect(error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('R4 — payload that inflates to ≤ cap → success (no error), full body delivered', async () => {
    // ~512 KiB inflated, well under the 1 MiB cap.
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
