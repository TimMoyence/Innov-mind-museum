import os from 'node:os';

import { env } from '@src/config/env';

type LogContext = Record<string, unknown>;

const defaultFields = {
  service: 'museum-backend',
  environment: env.nodeEnv,
  version: env.appVersion,
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
