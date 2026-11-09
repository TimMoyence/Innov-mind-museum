import os from 'node:os';

import { REDACTED, SENSITIVE_FIELD_REGEX, isUrlLikeValue, scrubUrl } from '@musaium/shared';

type LogContext = Record<string, unknown>;

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

const redactLogContext = (context: LogContext | undefined): LogContext | undefined => {
  if (context === undefined) return undefined;
  try {
    return redactValue(context) as LogContext;
  } catch {
    return { logContextRedactionFailed: true };
  }
};

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
