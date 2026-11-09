import * as Sentry from '@sentry/nextjs';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let onLogout: (() => void) | null = null;

export function registerLogoutHandler(handler: () => void): void {
  onLogout = handler;
}

function readCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = /(?:^|;\s*)csrf_token=([^;]+)/.exec(document.cookie);
  return match?.[1] !== undefined ? decodeURIComponent(match[1]) : null;
}

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

let isRefreshing = false;
let failedQueue: {
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}[] = [];

function processQueue(error: unknown, token: string | null): void {
  for (const entry of failedQueue) {
    if (error) {
      entry.reject(error);
    } else {
      entry.resolve(token as string);
    }
  }
  failedQueue = [];
}

function getBaseUrl(): string {
  if (typeof window === 'undefined') {
    return process.env.API_BASE_URL ?? 'http://localhost:3000';
  }
  return '';
}

async function doRefresh(): Promise<string> {
  const baseUrl = getBaseUrl();
  const csrfToken = readCsrfToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }
  const res = await fetch(`${baseUrl}/api/auth/refresh`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    throw new ApiError(res.status, res.statusText, 'Token refresh failed');
  }

  return 'cookie-issued';
}

async function refreshAccessToken(): Promise<string> {
  if (isRefreshing) {
    return new Promise<string>((resolve, reject) => {
      failedQueue.push({ resolve, reject });
    });
  }

  isRefreshing = true;
  try {
    const newToken = await doRefresh();
    processQueue(null, newToken);
    return newToken;
  } catch (err) {
    processQueue(err, null);
    onLogout?.();
    throw err;
  } finally {
    isRefreshing = false;
  }
}

export interface ApiRequestOptions {
  signal?: AbortSignal;
  skipAuthRefresh?: boolean;
}

interface InternalRequestOptions extends ApiRequestOptions {
  isRetry?: boolean;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options?: InternalRequestOptions,
): Promise<T> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (STATE_CHANGING_METHODS.has(method.toUpperCase())) {
    const csrfToken = readCsrfToken();
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
  }

  for (const [key, value] of Object.entries(Sentry.getTraceData())) {
    if (typeof value === 'string') {
      headers[key] = value;
    }
  }

  const res = await fetch(url, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: options?.signal,
  });

  if (res.status === 401 && !options?.isRetry && !options?.skipAuthRefresh) {
    try {
      await refreshAccessToken();
    } catch {
      throw new ApiError(401, 'Unauthorized', 'Session expired');
    }

    return request<T>(method, path, body, {
      isRetry: true,
      signal: options?.signal,
      skipAuthRefresh: options?.skipAuthRefresh,
    });
  }

  if (!res.ok) {
    let message = res.statusText;
    try {
      const errorBody = (await res.json()) as { message?: string };
      if (errorBody.message) {
        message = errorBody.message;
      }
    } catch {
      message = res.statusText;
    }
    throw new ApiError(res.status, res.statusText, message);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export function apiGet<T>(path: string, options?: ApiRequestOptions): Promise<T> {
  return request<T>('GET', path, undefined, options);
}

export function apiPost<T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T> {
  return request<T>('POST', path, body, options);
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('PATCH', path, body);
}

export function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('PUT', path, body);
}

export function apiDelete<T>(path: string): Promise<T> {
  return request<T>('DELETE', path);
}
