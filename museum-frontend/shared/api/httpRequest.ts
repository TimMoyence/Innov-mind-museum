import * as pako from 'pako';

import type { AxiosRequestConfig } from 'axios';

import { getCurrentDataMode } from '@/shared/infrastructure/dataMode/currentDataMode';
import { httpClient, mapAxiosError } from '@/shared/infrastructure/httpClient';
import { isAppError } from '@/shared/lib/errors';

type HeadersRecord = Record<string, string>;

/**
 * W1-GZIP — minimum serialized JSON size (bytes) above which a request body is
 * worth gzipping. Below this threshold the gzip header + framing overhead and
 * the CPU cost outweigh the bytes saved on the wire.
 */
const GZIP_MIN_BODY_BYTES = 1024;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  requiresAuth?: boolean;
  headers?: HeadersRecord;
  body?: unknown;
  responseType?: 'json' | 'arraybuffer' | 'blob' | 'text';
  /**
   * TD-TQ-01 / design D1 — AbortSignal forwarded to `AxiosRequestConfig.signal`
   * (axios ≥ 0.22). Lets TanStack Query's `QueryFunctionContext.signal` reach
   * the underlying HTTP layer so in-flight requests are cancelled when the
   * query is cancelled, the queryKey flips, or the consuming component unmounts.
   * PATTERNS.md:295.
   */
  signal?: AbortSignal;
}

const isFormData = (body: unknown): body is FormData => {
  if (typeof FormData === 'undefined') {
    return false;
  }

  return body instanceof FormData;
};

/**
 * Serializes a request body to its JSON wire string. A string body is assumed
 * to already be JSON and is passed through; anything else is `JSON.stringify`d.
 * @param body - the request body (object or pre-serialized string)
 * @returns the JSON string that would be sent on the wire
 */
const toJsonString = (body: unknown): string =>
  typeof body === 'string' ? body : JSON.stringify(body);

/**
 * UTF-8 byte length of a string (multibyte-safe), used to decide whether a body
 * is large enough to be worth gzipping. Falls back to `.length` if `Blob` /
 * `TextEncoder` are unavailable in the runtime.
 * @param value - the serialized JSON string
 * @returns the byte length of the string encoded as UTF-8
 */
const utf8ByteLength = (value: string): number => {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value).length;
  }
  return value.length;
};

/**
 * Result of the conditional gzip decision: either a compressed body (with its
 * forced headers) or `null` when the body must be sent uncompressed.
 */
interface GzipDecision {
  data: Uint8Array;
  headers: { 'Content-Type': string; 'Content-Encoding': string };
}

/**
 * W1-GZIP — decides whether to gzip a request body. Compresses ONLY when the
 * resolved data mode is `low` (weak network), the body is NOT FormData
 * (multipart streams must never be gzipped — axios derives their boundary
 * Content-Type), and the serialized JSON exceeds {@link GZIP_MIN_BODY_BYTES}.
 *
 * @param body - the request body
 * @returns the compressed payload + forced headers, or `null` to send as-is
 */
const maybeGzipBody = (body: unknown): GzipDecision | null => {
  if (body === undefined || body === null) return null;
  if (isFormData(body)) return null;
  if (getCurrentDataMode() !== 'low') return null;

  const json = toJsonString(body);
  if (utf8ByteLength(json) <= GZIP_MIN_BODY_BYTES) return null;

  return {
    data: pako.gzip(json),
    headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
  };
};

/**
 * Sends an HTTP request through the shared Axios client, mapping errors to {@link AppError}.
 * @param url - Request URL (relative paths are resolved against the runtime base URL).
 * @param options - HTTP method, headers, body, and auth requirement flag.
 * @returns Parsed response data of type `T`.
 */
export const httpRequest = async <T>(
  url: string,
  { requiresAuth = true, headers, body, method, responseType, signal }: RequestOptions = {},
): Promise<T> => {
  const finalHeaders: HeadersRecord = {
    ...(headers ?? {}),
  };

  if (body && !isFormData(body) && finalHeaders['Content-Type'] === undefined) {
    finalHeaders['Content-Type'] = 'application/json';
  }

  // W1-GZIP — on weak networks, gzip large JSON bodies to shrink the upload.
  // The backend `requestDecompressionMiddleware` inflates them before parsing.
  // FormData is never compressed (axios streams the multipart boundary itself).
  const gzip = maybeGzipBody(body);
  if (gzip) {
    finalHeaders['Content-Type'] = gzip.headers['Content-Type'];
    finalHeaders['Content-Encoding'] = gzip.headers['Content-Encoding'];
  }
  const data = gzip ? gzip.data : body;

  try {
    const requestConfig: AxiosRequestConfig & { requiresAuth: boolean } = {
      url,
      method: method ?? 'GET',
      data,
      headers: finalHeaders,
      requiresAuth,
      ...(responseType ? { responseType } : {}),
      ...(signal ? { signal } : {}),
    };

    const response = await httpClient.request<T>(requestConfig);

    return response.data;
  } catch (error) {
    if (isAppError(error)) {
      throw error;
    }
    throw mapAxiosError(error);
  }
};
