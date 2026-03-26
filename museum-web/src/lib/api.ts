/**
 * API client with automatic token refresh.
 *
 * - Client-side: base URL = '' (requests go through Next.js rewrite /api/ -> backend)
 * - Server-side: base URL = process.env.API_BASE_URL
 * - On 401: refreshes the access token via POST /api/auth/refresh, then retries
 * - Queues concurrent requests while a refresh is in-flight
 */

// ── Error class ────────────────────────────────────────────────────────

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

// ── In-memory token store ──────────────────────────────────────────────

let accessToken: string | null = null;
let refreshTokenValue: string | null = null;
let onLogout: (() => void) | null = null;

export function setTokens(access: string, refresh: string): void {
  accessToken = access;
  refreshTokenValue = refresh;
}

export function clearTokens(): void {
  accessToken = null;
  refreshTokenValue = null;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function registerLogoutHandler(handler: () => void): void {
  onLogout = handler;
}

// ── Refresh queue ──────────────────────────────────────────────────────

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

// ── Base URL ───────────────────────────────────────────────────────────

function getBaseUrl(): string {
  if (typeof window === 'undefined') {
    return process.env.API_BASE_URL ?? 'http://localhost:3000';
  }
  return '';
}

// ── Refresh logic ──────────────────────────────────────────────────────

async function doRefresh(): Promise<string> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: refreshTokenValue }),
  });

  if (!res.ok) {
    throw new ApiError(res.status, res.statusText, 'Token refresh failed');
  }

  const data = (await res.json()) as { accessToken: string; refreshToken: string };
  setTokens(data.accessToken, data.refreshToken);
  return data.accessToken;
}

async function refreshAccessToken(): Promise<string> {
  if (isRefreshing) {
    // Another refresh is already in-flight — queue this caller
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
    clearTokens();
    onLogout?.();
    throw err;
  } finally {
    isRefreshing = false;
  }
}

// ── Core request function ──────────────────────────────────────────────

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  isRetry = false,
): Promise<T> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // Handle 401 — attempt refresh (once)
  if (res.status === 401 && !isRetry) {
    if (!refreshTokenValue) {
      onLogout?.();
      throw new ApiError(401, 'Unauthorized', 'No refresh token available');
    }

    try {
      await refreshAccessToken();
    } catch {
      throw new ApiError(401, 'Unauthorized', 'Session expired');
    }

    // Retry the original request with the new token
    return request<T>(method, path, body, true);
  }

  if (!res.ok) {
    let message = res.statusText;
    try {
      const errorBody = (await res.json()) as { message?: string };
      if (errorBody.message) {
        message = errorBody.message;
      }
    } catch {
      // ignore parse errors — keep statusText
    }
    throw new ApiError(res.status, res.statusText, message);
  }

  // Handle 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

// ── Public API ─────────────────────────────────────────────────────────

export function apiGet<T>(path: string): Promise<T> {
  return request<T>('GET', path);
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('POST', path, body);
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('PATCH', path, body);
}
