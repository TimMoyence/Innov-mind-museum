interface LogContext {
  [key: string]: unknown;
}

const format = (level: 'info' | 'warn' | 'error', message: string, context?: LogContext): string => {
  return JSON.stringify({
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(context || {}),
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
