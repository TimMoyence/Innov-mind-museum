import { logger } from '@shared/logger/logger';
import { REDACTED, SENSITIVE_QUERY_KEYS } from '@shared/observability/sentry-scrubber';

import type { Request, Response, NextFunction } from 'express';

/** Health/metrics polling paths — too noisy to log. Matched against `req.originalUrl` exactly. */
const SILENT_PATHS: readonly string[] = ['/api/health', '/health', '/health/deep', '/metrics'];

/** F11 — Mirrors sentry-scrubber redaction list (single source of truth). */
function redactQueryString(originalUrl: string): string {
  const queryIndex = originalUrl.indexOf('?');
  if (queryIndex < 0) return originalUrl;

  const path = originalUrl.slice(0, queryIndex);
  const query = originalUrl.slice(queryIndex + 1);

  const redactedPairs = query
    .split('&')
    .map((pair) => {
      const eqIndex = pair.indexOf('=');
      if (eqIndex < 0) return pair;
      const key = pair.slice(0, eqIndex);
      return SENSITIVE_QUERY_KEYS.has(decodeURIComponent(key).toLowerCase())
        ? `${key}=${REDACTED}`
        : pair;
    })
    .join('&');

  return `${path}?${redactedPairs}`;
}

export const requestLoggerMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const startedAt = Date.now();
  const requestId = req.requestId;

  res.on('finish', () => {
    if (SILENT_PATHS.includes(req.originalUrl)) {
      return;
    }

    const userId = req.user?.id;

    logger.info('http_request', {
      requestId,
      method: req.method,
      path: redactQueryString(req.originalUrl),
      statusCode: res.statusCode,
      latencyMs: Date.now() - startedAt,
      ip: req.ip,
      ...(userId != null && { userId }),
    });
  });

  next();
};
