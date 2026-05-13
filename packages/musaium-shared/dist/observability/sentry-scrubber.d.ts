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
/** Query-string keys whose values must be stripped from captured URLs. */
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
