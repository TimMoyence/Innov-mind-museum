/**
 * Sentry PII scrubber for the mobile app — single source of truth for redaction logic.
 *
 * Kept Sentry-SDK-free so it can be unit-tested with plain objects. Applied via
 * `beforeSend` / `beforeBreadcrumb` hooks in `sentry-init.ts`.
 *
 * Pattern mirrors the backend scrubber (`museum-backend/src/shared/observability/sentry-scrubber.ts`).
 * Email fingerprinting uses a deterministic 32-bit fold — sufficient to correlate events
 * without leaking the raw address. Not a cryptographic primitive; the value never leaves
 * the client in raw form either way.
 */

/** Header names (case-insensitive) whose values must be redacted before leaving the app. */
const SENSITIVE_HEADER_REGEX = /^(authorization|cookie|x-api-key|x-auth-token)$/i;

/** Body / extra field names whose values must be redacted before leaving the app. */
const SENSITIVE_FIELD_REGEX = /password|token|secret|api[_-]?key|refresh/i;

/** Query-string keys whose values must be stripped from captured URLs. */
const SENSITIVE_QUERY_KEYS: ReadonlySet<string> = new Set(['token', 'password']);

/** Auth-adjacent paths where breadcrumb bodies could leak credentials. */
const SENSITIVE_BREADCRUMB_PATHS: readonly string[] = [
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
 * Hashes an email to an 8-char fingerprint using a deterministic 32-bit fold.
 * Cannot reverse back to the raw address. Collision rate is acceptable for
 * Sentry user correlation (non-security usage).
 */
export const hashEmail = (email: string): string | undefined => {
  if (!email) return undefined;
  let hash = 0xdeadbeef;
  for (let i = 0; i < email.length; i += 1) {
    hash = Math.imul(hash ^ email.charCodeAt(i), 2654435761);
  }
  return (hash >>> 0).toString(16).padStart(8, '0').slice(0, 8);
};

/** Returns a copy of `headers` with sensitive values redacted. */
const scrubHeaders = (headers: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = { ...headers };
  for (const key of Object.keys(out)) {
    if (SENSITIVE_HEADER_REGEX.test(key)) {
      out[key] = REDACTED;
    }
  }
  return out;
};

/** Recursively redacts values under sensitive keys. Arrays and nested objects are walked. */
const scrubRecord = (input: unknown): unknown => {
  if (Array.isArray(input)) {
    return input.map((item) => scrubRecord(item));
  }
  if (input !== null && typeof input === 'object') {
    const src = input as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(src)) {
      if (SENSITIVE_FIELD_REGEX.test(key)) {
        out[key] = REDACTED;
      } else {
        out[key] = scrubRecord(value);
      }
    }
    return out;
  }
  return input;
};

/** Strips sensitive query-string values from a URL while preserving the rest. */
const scrubUrl = (url: string): string => {
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

/** Applies all scrubbing rules to a Sentry event (returns new object). */
export const scrubEvent = <T extends ScrubbableEvent>(event: T): T => {
  const next: T = { ...event };

  if (next.request) {
    const request = { ...next.request };
    if (request.headers && typeof request.headers === 'object') {
      request.headers = scrubHeaders(request.headers);
    }
    if (request.data && typeof request.data === 'object') {
      request.data = scrubRecord(request.data);
    }
    if (typeof request.url === 'string') {
      request.url = scrubUrl(request.url);
    }
    next.request = request;
  }

  if (next.user?.email) {
    const user = { ...next.user };
    const fingerprint = hashEmail(user.email ?? '');
    delete user.email;
    if (fingerprint) {
      user.id = user.id ?? fingerprint;
      (user as Record<string, unknown>).email_hash = fingerprint;
    }
    next.user = user;
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
