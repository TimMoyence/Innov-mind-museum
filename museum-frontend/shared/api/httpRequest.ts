import * as pako from 'pako';

import type { AxiosRequestConfig } from 'axios';

import { getCurrentDataMode } from '@/shared/infrastructure/dataMode/currentDataMode';
import { httpClient, mapAxiosError } from '@/shared/infrastructure/httpClient';
import { isAppError } from '@/shared/lib/errors';

type HeadersRecord = Record<string, string>;

const GZIP_MIN_BODY_BYTES = 1024;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  requiresAuth?: boolean;
  headers?: HeadersRecord;
  body?: unknown;
  responseType?: 'json' | 'arraybuffer' | 'blob' | 'text';
  signal?: AbortSignal;
  timeoutMs?: number;
}

const isFormData = (body: unknown): body is FormData => {
  if (typeof FormData === 'undefined') {
    return false;
  }

  return body instanceof FormData;
};

const toJsonString = (body: unknown): string =>
  typeof body === 'string' ? body : JSON.stringify(body);

const utf8ByteLength = (value: string): number => {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value).length;
  }
  return value.length;
};

interface GzipDecision {
  data: Uint8Array;
  headers: { 'Content-Type': string; 'Content-Encoding': string };
}

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

export const httpRequest = async <T>(
  url: string,
  {
    requiresAuth = true,
    headers,
    body,
    method,
    responseType,
    signal,
    timeoutMs,
  }: RequestOptions = {},
): Promise<T> => {
  const finalHeaders: HeadersRecord = {
    ...(headers ?? {}),
  };

  if (body && !isFormData(body) && finalHeaders['Content-Type'] === undefined) {
    finalHeaders['Content-Type'] = 'application/json';
  }

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
      ...(timeoutMs ? { timeout: timeoutMs } : {}),
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
