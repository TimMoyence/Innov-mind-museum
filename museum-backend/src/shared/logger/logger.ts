import os from 'node:os';

type LogContext = Record<string, unknown>;

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
  return JSON.stringify({
    level,
    message,
    timestamp: new Date().toISOString(),
    ...defaultFields,
    ...(context ?? {}),
  });
};

/** Structured JSON logger that writes to stdout/stderr with ISO-8601 timestamps. */
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
