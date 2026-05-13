/**
 * Cross-runtime Sentry PII scrubber — single source of truth for redaction logic.
 *
 * Sentry-SDK-free so it can be unit-tested with plain objects and reused
 * across Node, React Native, and Next.js (client / server / edge) runtimes.
 *
 * The host injects its own `hashEmail` implementation (Node `crypto.createHash`
 * on the backend, 32-bit fold elsewhere) — that is the ONLY platform-specific
 * piece. Everything else (regex constants, traversal, URL/header/record
 * scrubbing, breadcrumb dropping) is identical across runtimes and lives here.
 *
 * @see packages/musaium-shared/src/observability/sentry-scrubber.test.ts
 *   golden-input/golden-output identity test that guards against silent drift.
 */

/** Header names (case-insensitive) whose values must be redacted before leaving the app. */
export const SENSITIVE_HEADER_REGEX = /^(authorization|cookie|x-api-key|x-auth-token)$/i;

/** Body / extra field names whose values must be redacted before leaving the app. */
export const SENSITIVE_FIELD_REGEX = /password|token|secret|api[_-]?key|refresh/i;

/** Query-string keys whose values must be stripped from captured URLs. */
export const SENSITIVE_QUERY_KEYS: ReadonlySet<string> = new Set([
  'access_token',
  'api_key',
  'apikey',
  'password',
  'refresh_token',
  'secret',
  'token',
]);

/** Auth-adjacent paths where breadcrumb bodies could leak credentials. */
export const SENSITIVE_BREADCRUMB_PATHS: readonly string[] = [
  '/auth/login',
  '/auth/register',
  '/auth/reset-password',
  '/auth/change-password',
];

/** Replacement marker written in place of redacted values. */
export const REDACTED = '[redacted]';

/** Minimal shape of a Sentry event we read. Stays structural to avoid a hard SDK dep. */
export interface ScrubbableEvent {
  request?: {
    headers?: Record<string, unknown>;
    data?: unknown;
    url?: string;
    query_string?: unknown;
  };
  user?: {
    email?: string;
    id?: string;
    username?: string;
    [key: string]: unknown;
  };
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
}

/** Minimal shape of a Sentry breadcrumb we read. */
export interface ScrubbableBreadcrumb {
  category?: string;
  data?: {
    url?: string;
    [key: string]: unknown;
  };
}

/**
 * Host-injected dependencies. Only `hashEmail` differs per runtime today.
 *
 * - Backend: `node:crypto.createHash('sha256').update(email).digest('hex').slice(0, 8)`
 * - Frontend / Web: deterministic 32-bit fold (no `crypto` polyfill required)
 */
export interface ScrubberDeps {
  /**
   * Hashes an email down to an 8-char fingerprint. Returns `undefined` for empty input.
   * MUST be deterministic so events for the same address correlate in Sentry.
   */
  hashEmail: (email: string) => string | undefined;
}

/** Returns a copy of `headers` with sensitive values redacted. */
export const scrubHeaders = (headers: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = { ...headers };
  for (const key of Object.keys(out)) {
    if (SENSITIVE_HEADER_REGEX.test(key)) {
      out[key] = REDACTED;
    }
  }
  return out;
};

/** Recursively redacts values under sensitive keys. Arrays and nested objects are walked. */
export const scrubRecord = (input: unknown): unknown => {
  if (Array.isArray(input)) {
    return input.map((item) => scrubRecord(item));
  }
  if (input !== null && typeof input === 'object') {
    const src = input as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(src)) {
      out[key] = SENSITIVE_FIELD_REGEX.test(key) ? REDACTED : scrubRecord(value);
    }
    return out;
  }
  return input;
};

/** Strips sensitive query-string values from a URL while preserving the rest. */
export const scrubUrl = (url: string): string => {
  const qIndex = url.indexOf('?');
  if (qIndex === -1) return url;
  const base = url.slice(0, qIndex);
  const qs = url.slice(qIndex + 1);
  const parts = qs.split('&').map((pair) => {
    const eq = pair.indexOf('=');
    if (eq === -1) return pair;
    const key = pair.slice(0, eq);
    if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
      return `${key}=${REDACTED}`;
    }
    return pair;
  });
  return `${base}?${parts.join('&')}`;
};

/** Returns a copy of `request` with sensitive headers / data / URL fields scrubbed. */
const scrubRequest = (
  request: NonNullable<ScrubbableEvent['request']>,
): NonNullable<ScrubbableEvent['request']> => {
  const out = { ...request };
  if (out.headers && typeof out.headers === 'object') {
    out.headers = scrubHeaders(out.headers);
  }
  if (out.data && typeof out.data === 'object') {
    out.data = scrubRecord(out.data);
  }
  if (typeof out.url === 'string') {
    out.url = scrubUrl(out.url);
  }
  return out;
};

/** Returns a copy of `user` with the raw email removed, replaced by a stable fingerprint. */
const scrubUser = (
  user: NonNullable<ScrubbableEvent['user']>,
  deps: ScrubberDeps,
): NonNullable<ScrubbableEvent['user']> => {
  const out = { ...user };
  const fingerprint = deps.hashEmail(out.email ?? '');
  delete out.email;
  if (fingerprint) {
    out.id = out.id ?? fingerprint;
    (out as Record<string, unknown>).email_hash = fingerprint;
  }
  return out;
};

/**
 * Applies all scrubbing rules to a Sentry event (returns a new object).
 *
 * Email fingerprinting is delegated to `deps.hashEmail` — pass the runtime's
 * implementation (Node crypto on backend, 32-bit fold elsewhere).
 */
export const scrubEvent = <T extends ScrubbableEvent>(event: T, deps: ScrubberDeps): T => {
  const next: T = { ...event };

  if (next.request) {
    next.request = scrubRequest(next.request);
  }

  if (next.user?.email) {
    next.user = scrubUser(next.user, deps);
  }

  if (next.extra && typeof next.extra === 'object') {
    next.extra = scrubRecord(next.extra) as Record<string, unknown>;
  }

  return next;
};

/** Returns `true` when the breadcrumb should be dropped (auth-adjacent HTTP call). */
export const shouldDropBreadcrumb = (breadcrumb: ScrubbableBreadcrumb): boolean => {
  if (breadcrumb.category !== 'http') return false;
  const url = breadcrumb.data?.url;
  if (typeof url !== 'string') return false;
  return SENSITIVE_BREADCRUMB_PATHS.some((path) => url.includes(path));
};
