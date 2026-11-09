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

type SupportedEncoding = 'gzip' | 'deflate' | 'br';
type Decompressor = Gunzip | Inflate | BrotliDecompress;
type DecompressorFactory = () => Decompressor;

const DECOMPRESSORS = new Map<SupportedEncoding, DecompressorFactory>([
  ['gzip', createGunzip],
  ['deflate', createInflate],
  ['br', createBrotliDecompress],
]);

const isSupportedEncoding = (value: string): value is SupportedEncoding =>
  DECOMPRESSORS.has(value as SupportedEncoding);

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
  const factory = DECOMPRESSORS.get(encoding);
  if (factory === undefined) {
    next(unsupportedEncoding(encoding));
    return;
  }

  const cap = parseByteLimit(env.jsonBodyLimit);
  const decompressor = factory();
  const inflated = new PassThrough();

  const encodedSource = req as unknown as NodeJS.ReadableStream;
  const pipeEncodedSource = encodedSource.pipe.bind(encodedSource);

  let decompressedBytes = 0;
  let aborted = false;

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
    fail(unsupportedEncoding(encoding));
  });

  pipeEncodedSource(decompressorWritableSink(decompressor));

  reassignReadable(req, inflated);
  delete req.headers['content-encoding'];
  delete req.headers['content-length'];
  req.headers['transfer-encoding'] = 'chunked';

  next();
}

function decompressorWritableSink(decompressor: Decompressor): NodeJS.WritableStream {
  return decompressor as unknown as NodeJS.WritableStream;
}

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
