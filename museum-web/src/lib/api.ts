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
 */

import * as Sentry from '@sentry/nextjs';

// ── Error class ────────────────────────────────────────────────────────

export class ApiError extends Error {
  /**
   * The parsed JSON response body, when the failing response carried one.
   * Callers (e.g. the admin login flow) discriminate on it — `mfaRequired`,
   * `mfaEnrollmentRequired`, or `{ error: { code } }` — without re-parsing.
   * `undefined` when the body was absent or not valid JSON.
   */
  public body?: unknown;

  constructor(
    public readonly status: number,
    public readonly statusText: string,
    message: string,
    body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
    this.body = body;
  }
}

// ── Logout handler (called when refresh ultimately fails) ──────────────

let onLogout: (() => void) | null = null;

export function registerLogoutHandler(handler: () => void): void {
  onLogout = handler;
}

// ── CSRF token helper ──────────────────────────────────────────────────

/** Reads the csrf_token cookie (set by backend, NOT HttpOnly) for double-submit. */
function readCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = /(?:^|;\s*)csrf_token=([^;]+)/.exec(document.cookie);
  // match[1] is the capture group; guaranteed defined when match is non-null.
  return match?.[1] !== undefined ? decodeURIComponent(match[1]) : null;
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
    onLogout?.();
    throw err;
  } finally {
    isRefreshing = false;
  }
}

// ── Core request function ──────────────────────────────────────────────

/**
 * Options accepted by public API request helpers.
 *
 * Phase 3 (web refactor 2026-05-23) scope: `signal` is currently honoured by
 * `apiGet` only — `useFetchData` needs it to cancel in-flight reads when
 * dependencies change or the component unmounts. Mutation helpers
 * (`apiPost`/`apiPatch`/`apiPut`/`apiDelete`) keep their current signatures
 * to limit blast-radius; the same option can be added trivially later if a
 * `useMutation` hook surfaces.
 */
export interface ApiRequestOptions {
  /** Optional AbortSignal forwarded to the underlying fetch() call. */
  signal?: AbortSignal;
  /**
   * Opt out of the 401 → auto-refresh → retry → onLogout path. A 401 then
   * falls straight through to the error block and throws an `ApiError`. Used by
   * the MFA challenge/recovery calls (and the credentials login): a 401 there is
   * a DOMAIN error (wrong/expired code, no session yet), not session expiry, so
   * firing the session-refresh/logout would bounce the admin off the step.
   * Does NOT affect CSRF or `credentials: 'include'`.
   */
  skipAuthRefresh?: boolean;
}

interface InternalRequestOptions extends ApiRequestOptions {
  /** Set on the recursive call after a refresh — prevents an infinite loop. */
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

  // F7 — auth via HttpOnly access_token cookie (sent automatically by `credentials: 'include'`).
  // For state-changing methods we additionally send the csrf_token cookie value as the
  // X-CSRF-Token header so the backend's double-submit middleware accepts the request.
  if (STATE_CHANGING_METHODS.has(method.toUpperCase())) {
    const csrfToken = readCsrfToken();
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
  }

  // TD-47 — forward the active Sentry trace context so server-rendered RSC calls
  // (which bypass the SDK's auto-fetch instrumentation) appear in the correlated
  // BE↔FE trace. getTraceData() returns {} or undefined values when no span is
  // active, so only string-typed entries are copied — never an undefined header.
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

  // Handle 401 — attempt refresh (once). F7: cookie-based, no token check needed
  // upfront; the backend rejects with 401 if the refresh cookie is also missing/expired.
  // refreshAccessToken itself fires onLogout on definitive failure (it owns the queue);
  // we just translate the throw into an ApiError for the caller.
  if (res.status === 401 && !options?.isRetry && !options?.skipAuthRefresh) {
    try {
      await refreshAccessToken();
    } catch {
      throw new ApiError(401, 'Unauthorized', 'Session expired');
    }

    // Retry the original request — new cookies are now in the jar.
    // Propagate the abort signal so a caller-driven cancel still takes effect on retry.
    return request<T>(method, path, body, {
      isRetry: true,
      signal: options?.signal,
      skipAuthRefresh: options?.skipAuthRefresh,
    });
  }

  if (!res.ok) {
    let message = res.statusText;
    let parsedBody: unknown;
    try {
      parsedBody = await res.json();
      const errorBody = parsedBody as { message?: string };
      if (errorBody.message) {
        message = errorBody.message;
      }
    } catch {
      // ignore parse errors — keep statusText, leave body undefined
    }
    throw new ApiError(res.status, res.statusText, message, parsedBody);
  }

  // Handle 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

// ── Public API ─────────────────────────────────────────────────────────

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
