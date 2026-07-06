import { PassThrough } from 'node:stream';
import {
  createBrotliDecompress,
  createGunzip,
  createInflate,
  type Gunzip,
  type Inflate,
  type BrotliDecompress,
} from 'node:zlib';

import { AppError } from '@shared/errors/app.error';
import { env } from '@src/config/env';

import type { Request, Response, NextFunction } from 'express';

/**
 * W1-GZIP — request-body decompression middleware (PROD-SAFE).
 *
 * Inflates a `Content-Encoding: gzip|deflate|br` request body BEFORE
 * `express.json()` parses it, so weak-network clients (FE low data mode) can
 * gzip large JSON payloads and shrink upload bytes. PROD-SAFE: this is a real
 * capability that always runs — it MUST NOT branch on the deployment
 * environment to disable itself (it is NOT the W2 fault injector).
 *
 * Security-critical: a small compressed body can inflate into gigabytes
 * (a "zip bomb"). The inflate is therefore drained through a STREAMING
 * decompressed-byte counter capped at `bytes(env.jsonBodyLimit)`; on breach the
 * inflate stream is destroyed and `next(AppError 413)` fires BEFORE the full
 * payload is ever materialized in memory.
 *
 * @see lib-docs/express/PATTERNS.md §3.3 (mount ordering, after compression /
 *   before express.json) + §5 (req.body undefined when no parser ran).
 */

type SupportedEncoding = 'gzip' | 'deflate' | 'br';
type Decompressor = Gunzip | Inflate | BrotliDecompress;
type DecompressorFactory = () => Decompressor;

const DECOMPRESSORS: Record<SupportedEncoding, DecompressorFactory> = {
  gzip: createGunzip,
  deflate: createInflate,
  br: createBrotliDecompress,
};

const isSupportedEncoding = (value: string): value is SupportedEncoding =>
  value === 'gzip' || value === 'deflate' || value === 'br';

/**
 * Parses an express byte-limit string (e.g. `'1mb'`, `'512kb'`) into a byte
 * count, mirroring the `bytes` package semantics used by `express.json`. Kept
 * local (no extra dependency) so the streaming cap is derived from the SAME
 * `env.jsonBodyLimit` value `express.json` honors.
 *
 * @param limit - byte-limit string or raw byte count
 * @returns the limit expressed in bytes (0 when unparseable)
 */
export function parseByteLimit(limit: string): number {
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

const payloadTooLarge = (): AppError =>
  new AppError({
    message: 'Decompressed request body exceeds the configured limit',
    statusCode: 413,
    code: 'PAYLOAD_TOO_LARGE',
  });

const unsupportedEncoding = (encoding: string): AppError =>
  new AppError({
    message: `Unsupported Content-Encoding: ${encoding}`,
    statusCode: 415,
    code: 'UNSUPPORTED_MEDIA_TYPE',
  });

/**
 * Decompresses a `Content-Encoding`-tagged request body into a fresh readable
 * surface that `express.json` (downstream) drains. No header (or `identity`) →
 * `next()` untouched. Unknown encoding → `next(AppError 415)`. Over-cap inflate
 * → destroy + `next(AppError 413)` (streaming, pre-materialization).
 *
 * @param req - incoming request (also a Readable stream of the raw body bytes)
 * @param _res - unused response handle
 * @param next - express continuation
 */
export function requestDecompressionMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const header = req.headers['content-encoding'];
  if (header === undefined || header === '' || header === 'identity') {
    next();
    return;
  }

  const encoding = header.trim().toLowerCase();
  if (!isSupportedEncoding(encoding)) {
    next(unsupportedEncoding(encoding));
    return;
  }
  const factory: DecompressorFactory | undefined = DECOMPRESSORS[encoding];
  // SEC (CodeQL js/unvalidated-dynamic-method-call): `encoding` is already gated
  // by isSupportedEncoding() above, but validate the looked-up factory is a
  // callable own-value before invoking it — defence-in-depth against any drift
  // between the allow-list and the DECOMPRESSORS map, and the guard CodeQL reads.
  if (typeof factory !== 'function') {
    next(unsupportedEncoding(encoding));
    return;
  }

  const cap = parseByteLimit(env.jsonBodyLimit);
  const decompressor = factory();
  // The readable surface express.json (downstream) drains. The decompressor
  // feeds it lazily AS it is pulled, so a zip bomb is aborted mid-inflate the
  // moment the running counter crosses the cap — never fully materialized.
  const inflated = new PassThrough();

  // Capture the ORIGINAL encoded stream's `pipe` BEFORE swapping req's readable
  // surface, so we pipe the raw (compressed) bytes into the decompressor — not
  // the replacement surface (which would create a feedback loop).
  const encodedSource = req as unknown as NodeJS.ReadableStream;
  const pipeEncodedSource = encodedSource.pipe.bind(encodedSource);

  let decompressedBytes = 0;
  let aborted = false;

  // Single error sink: a cap breach (413) or a malformed body (415). It both
  // tears down the inflate pipeline AND surfaces the error to `next` — the unit
  // contract asserts `next(AppError)`; mounted in the app, the downstream body
  // parser also sees the destroyed stream's error and forwards it identically.
  const fail = (error: AppError): void => {
    if (aborted) return;
    aborted = true;
    decompressor.destroy();
    if (!inflated.destroyed) inflated.destroy(error);
    next(error);
  };

  decompressor.on('data', (chunk: Buffer) => {
    if (aborted) return;
    decompressedBytes += chunk.length;
    if (decompressedBytes > cap) {
      // Zip-bomb guard: abort mid-inflate, BEFORE buffering the full payload.
      fail(payloadTooLarge());
      return;
    }
    inflated.write(chunk);
  });

  decompressor.on('end', () => {
    if (aborted) return;
    inflated.end();
  });

  decompressor.on('error', () => {
    // Malformed compressed body → treat as garbage / unsupported payload.
    fail(unsupportedEncoding(encoding));
  });

  // Pipe the ORIGINAL encoded request bytes into the decompressor FIRST — while
  // `req`'s real stream methods are still intact, so the source's own pipe
  // machinery (`req.on('data')`) registers on the source, not on the swapped
  // surface. Reordering this after the swap would starve the decompressor.
  pipeEncodedSource(decompressorWritableSink(decompressor));

  // Swap req's readable surface so downstream (express.json) reads the inflated
  // bytes. The body is now identity-encoded with an UNKNOWN length (we stream
  // the inflate), so: drop Content-Encoding (already inflated), drop the now-
  // wrong Content-Length, and signal `Transfer-Encoding: chunked` so the body
  // parser's `hasbody()` check still detects a body and reads until end. Without
  // this, deleting Content-Length makes express.json see "no body" → req.body
  // stays undefined → routes 400 on "expected object, received undefined".
  reassignReadable(req, inflated);
  delete req.headers['content-encoding'];
  delete req.headers['content-length'];
  req.headers['transfer-encoding'] = 'chunked';

  // Hand off synchronously (R1 contract): downstream drains `req` (now backed by
  // `inflated`) and pulls the inflate through. A breach calls `next(413)` via
  // `fail()` (unit asserts next(413); mounted, the body parser also forwards the
  // destroyed-stream error to the same 413).
  next();
}

/**
 * Returns the decompressor typed as a Writable destination for `pipe`.
 *
 * @param decompressor - the zlib transform stream
 * @returns the decompressor as a pipe destination
 */
function decompressorWritableSink(decompressor: Decompressor): NodeJS.WritableStream {
  return decompressor as unknown as NodeJS.WritableStream;
}

/**
 * Rebinds `req`'s Readable-stream CONSUMER surface to `replacement` so that any
 * downstream consumer draining `req` (async-iterator, `.on('data')`, `.pipe`)
 * reads the inflated bytes instead of the raw encoded ones.
 *
 * We deliberately delegate ONLY the listener-registration + iteration surface
 * (`on` / `once` / `addListener` / `removeListener` / `pipe` / asyncIterator).
 * We do NOT shadow `emit` / `read` / `pause` / `resume`: the ORIGINAL `req`
 * stream (the encoded source already piped into the decompressor) uses those
 * internally for its own flow control; shadowing them would break the source
 * pump and starve the decompressor. Express's `req` keeps all its non-stream
 * properties (headers, method, url, params, …) intact.
 *
 * @param req - the request whose readable consumer surface is being swapped
 * @param replacement - the stream that now provides the (inflated) body bytes
 */
function reassignReadable(req: Request, replacement: PassThrough): void {
  const target = req as unknown as Record<string | symbol, unknown>;
  const source = replacement as unknown as Record<string | symbol, unknown>;

  const delegate = (key: string | symbol): void => {
    const value = source[key];
    if (typeof value === 'function') {
      target[key] = (value as (...args: unknown[]) => unknown).bind(replacement);
    }
  };

  delegate('on');
  delegate('once');
  delegate('removeListener');
  delegate('addListener');
  delegate('pipe');
  delegate(Symbol.asyncIterator);
}
