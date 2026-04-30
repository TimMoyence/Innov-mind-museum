/**
 * API client with automatic token refresh.
 *
 * - Client-side: base URL = '' (requests go through Next.js rewrite /api/ -> backend)
 * - Server-side: base URL = process.env.API_BASE_URL
 * - On 401: refreshes the access token via POST /api/auth/refresh, then retries
 * - Queues concurrent requests while a refresh is in-flight
 *
 * F7 (2026-04-30) — Auth tokens live in HttpOnly + Secure + SameSite=Strict cookies
 * issued by the backend on /login + /refresh + /social-login. The browser sends them
 * automatically with `credentials: 'include'`. JS code can NO LONGER read access /
 * refresh tokens, eliminating XSS exfiltration. The csrf_token cookie (NOT HttpOnly)
 * is read here and echoed back as `X-CSRF-Token` on state-changing requests for
 * double-submit verification by the backend.
 *
 * The legacy `setTokens` / `getAccessToken` exports are kept as no-ops for backward
 * compatibility with call sites that haven't migrated yet — auth state now lives in
 * cookies, not in this module.
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

// ── Logout handler (called when refresh ultimately fails) ──────────────

let onLogout: (() => void) | null = null;

/**
 * F7 — Cookies are HttpOnly so JS cannot set/read access or refresh tokens. These
 * functions are kept as no-op exports so existing call sites compile; the actual
 * auth state lives in the backend-issued cookies. Future cleanup: drop both calls
 * once every consumer has migrated.
 */
export function setTokens(_access: string, _refresh: string): void {
  /* no-op — tokens live in HttpOnly cookies post-F7 */
}

export function clearTokens(): void {
  /* no-op — backend /logout clears cookies; consumers should call POST /api/auth/logout */
}

export function getAccessToken(): string | null {
  // Cookies are HttpOnly so JS cannot read the access token. Always returns null
  // post-F7. Use `credentials: 'include'` instead — fetch will attach the cookie.
  return null;
}

export function registerLogoutHandler(handler: () => void): void {
  onLogout = handler;
}

// ── CSRF token helper ──────────────────────────────────────────────────

/** Reads the csrf_token cookie (set by backend, NOT HttpOnly) for double-submit. */
function readCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = /(?:^|;\s*)csrf_token=([^;]+)/.exec(document.cookie);
  return match ? decodeURIComponent(match[1]) : null;
}

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

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
  // F7 — refresh now relies on the HttpOnly refresh_token cookie (Path=/api/auth)
  // which the browser sends automatically. No body needed; backend reads the cookie.
  // Response sets a new access_token + csrf_token cookie pair.
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

  // The JSON envelope is preserved for mobile compat but we don't need it here —
  // the new cookies are already attached to the response. Returning a placeholder
  // string keeps the queue API stable for legacy callers.
  return 'cookie-issued';
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

  // F7 — auth via HttpOnly access_token cookie (sent automatically by `credentials: 'include'`).
  // For state-changing methods we additionally send the csrf_token cookie value as the
  // X-CSRF-Token header so the backend's double-submit middleware accepts the request.
  if (STATE_CHANGING_METHODS.has(method.toUpperCase())) {
    const csrfToken = readCsrfToken();
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
  }

  const res = await fetch(url, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // Handle 401 — attempt refresh (once). F7: cookie-based, no token check needed
  // upfront; the backend rejects with 401 if the refresh cookie is also missing/expired.
  // refreshAccessToken itself fires onLogout on definitive failure (it owns the queue);
  // we just translate the throw into an ApiError for the caller.
  if (res.status === 401 && !isRetry) {
    try {
      await refreshAccessToken();
    } catch {
      throw new ApiError(401, 'Unauthorized', 'Session expired');
    }

    // Retry the original request — new cookies are now in the jar.
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
