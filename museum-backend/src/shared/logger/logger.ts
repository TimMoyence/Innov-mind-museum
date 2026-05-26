import os from 'node:os';

// Import the redaction primitives from the shared package directly (NOT via
// `@src/...` and NEVER via `@src/config/env`). `@musaium/shared` is a pure,
// env-free module (regex + string traversal only) — it does not snapshot
// `process.env`, so it is safe to pull from the logger without re-introducing
// the eager-env e2e flakiness documented above. Uses the root specifier (not
// the `/observability` subpath) to match the repo's `moduleResolution: node`.
import { REDACTED, SENSITIVE_FIELD_REGEX, isUrlLikeValue, scrubUrl } from '@musaium/shared';

type LogContext = Record<string, unknown>;

/**
 * Cycle 10 (A-02) — central log redaction.
 *
 * Recursively walks the log context and, BEFORE it ever reaches stdout:
 *   - redacts the VALUE of any key matching `SENSITIVE_FIELD_REGEX`
 *     (`password` / `token` / `secret` / `api_key` / `refresh`), regardless of
 *     value type (R5) ;
 *   - runs `scrubUrl` on any URL-like string value, stripping sensitive
 *     query-params (presigned-S3 signature, magic-link token, …) while keeping
 *     host + path + non-sensitive params (R2/R9) ;
 *   - leaves everything else untouched (R3/R10 — no over-masking) ;
 *   - is idempotent: `[redacted]` is not URL-like, so re-scrubbing is a no-op (R7).
 *
 * Reuses `@musaium/shared` as the single source of truth (D5/NFR6) — no
 * second copy of the sensitive-key lists.
 */
const redactValue = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return isUrlLikeValue(value) ? scrubUrl(value) : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }
  if (value !== null && typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(src)) {
      out[key] = SENSITIVE_FIELD_REGEX.test(key) ? REDACTED : redactValue(child);
    }
    return out;
  }
  return value;
};

/**
 * Fail-safe wrapper (R6/NFR5). The logger sits on the critical path; a hostile
 * context (getter that throws, circular ref, non-serialisable value) must NEVER
 * propagate an exception nor leak the raw un-redacted payload. On failure we
 * return a minimal marker object instead of the original context.
 */
const redactLogContext = (context: LogContext | undefined): LogContext | undefined => {
  if (context === undefined) return undefined;
  try {
    return redactValue(context) as LogContext;
  } catch {
    return { logContextRedactionFailed: true };
  }
};

// Read process.env directly — importing `@src/config/env` from logger forces
// eager evaluation of the full env schema as soon as ANY module pulls the
// logger. That made the e2e harness flaky for the knowledge-extraction
// suite: the testcontainer's host/port were set on `process.env` AFTER
// env.ts had already snapshotted them, so AppDataSource pointed at
// localhost:5432 and connections failed with `ECONNREFUSED ::1:5432`.
// Logger only needs the static `service` / `environment` / `version`
// fields, none of which depend on the rest of the env schema.
const defaultFields = {
  service: 'museum-backend',
  environment: process.env.NODE_ENV ?? 'development',
  version: process.env.APP_VERSION ?? process.env.npm_package_version ?? 'unknown',
  hostname: os.hostname(),
};

const format = (
  level: 'info' | 'warn' | 'error',
  message: string,
  context?: LogContext,
): string => {
  const timestamp = new Date().toISOString();
  try {
    return JSON.stringify({
      level,
      message,
      timestamp,
      ...defaultFields,
      ...(redactLogContext(context) ?? {}),
    });
  } catch {
    // Serialisation-time failure (R6/NFR5): a value survives `redactValue`
    // untouched (e.g. a BigInt, which is neither string/array/object) yet blows
    // up in `JSON.stringify`. Mirror the `redactLogContext` fail-safe — emit a
    // minimal marker line WITHOUT the raw context and NEVER throw. The marker
    // object is plain primitives only, so this stringify cannot itself fail.
    return JSON.stringify({
      level,
      message,
      timestamp,
      ...defaultFields,
      logContextRedactionFailed: true,
    });
  }
};

export const logger = {
  info(message: string, context?: LogContext): void {
    console.log(format('info', message, context));
  },
  warn(message: string, context?: LogContext): void {
    console.warn(format('warn', message, context));
  },
  error(message: string, context?: LogContext): void {
    console.error(format('error', message, context));
  },
};
