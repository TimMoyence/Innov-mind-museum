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
export declare const SENSITIVE_HEADER_REGEX: RegExp;
/** Body / extra field names whose values must be redacted before leaving the app. */
export declare const SENSITIVE_FIELD_REGEX: RegExp;
/** Query-string keys whose values must be stripped from captured URLs.
 *
 * R1 (2026-05-21) — extended from 7 to 11 entries to close the magic-link /
 * OAuth / signup query-string leak (`code`, `state`, `email`, `phone`). Sentinel
 * `scripts/sentinels/sentry-scrubber-parity.mjs` `CANONICAL_HASH` bumped in
 * lockstep ; golden test `sentry-scrubber.test.ts` asserts the set size.
 *
 * Cycle 10 (A-02, 2026-05-26) — extended from 11 to 16 entries to close the
 * presigned-S3 / signed-URL signature leak (`x-amz-signature`,
 * `x-amz-credential`, `x-amz-security-token`, `sig`, `signature`). Matching is
 * case-insensitive (`key.toLowerCase()` in `scrubUrl`) so `X-Amz-Signature`
 * matches `x-amz-signature`. Generic `key` / `author` are deliberately NOT
 * added (too prone to false positives — D4). Sentinel `CANONICAL_HASH` bumped
 * in lockstep ; golden test asserts the 16-entry set.
 */
export declare const SENSITIVE_QUERY_KEYS: ReadonlySet<string>;
/** Auth-adjacent paths where breadcrumb bodies could leak credentials. */
export declare const SENSITIVE_BREADCRUMB_PATHS: readonly string[];
/** Replacement marker written in place of redacted values. */
export declare const REDACTED = "[redacted]";
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
    /** R2 (2026-05-21) — Sentry tags are indexed + persistent ; scrubbed by scrubEvent. */
    tags?: Record<string, unknown>;
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
export declare const scrubHeaders: (headers: Record<string, unknown>) => Record<string, unknown>;
/** Recursively redacts values under sensitive keys. Arrays and nested objects are walked. */
export declare const scrubRecord: (input: unknown) => unknown;
/**
 * Heuristic for detecting URL-like string values in dynamic tag/context maps.
 *
 * R2/R3 (2026-05-21) — used by both `scrubEvent` (when walking `event.tags`)
 * and `captureExceptionWithContext` (BE wrapper at sentry.ts) to decide
 * whether to run `scrubUrl` on a given tag value. Conservative on purpose:
 * matches strings carrying `?` (query-string), absolute paths (`/…`), or
 * `http://` / `https://` schemes. Non-URL string values (e.g. `'GET'`,
 * `'500'`) flow through untouched.
 */
export declare const isUrlLikeValue: (value: unknown) => value is string;
/** Strips sensitive query-string values from a URL while preserving the rest. */
export declare const scrubUrl: (url: string) => string;
/**
 * Applies all scrubbing rules to a Sentry event (returns a new object).
 *
 * Email fingerprinting is delegated to `deps.hashEmail` — pass the runtime's
 * implementation (Node crypto on backend, 32-bit fold elsewhere).
 */
export declare const scrubEvent: <T extends ScrubbableEvent>(event: T, deps: ScrubberDeps) => T;
/** Returns `true` when the breadcrumb should be dropped (auth-adjacent HTTP call). */
export declare const shouldDropBreadcrumb: (breadcrumb: ScrubbableBreadcrumb) => boolean;
