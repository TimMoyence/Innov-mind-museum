import { logger } from '@shared/logger/logger';
import { REDACTED, SENSITIVE_QUERY_KEYS } from '@shared/observability/sentry-scrubber';

import type { Request, Response, NextFunction } from 'express';

/**
 * Paths whose successful traffic is too noisy to log (health checks polled by uptime monitors,
 * load balancers, and CI smoke tests). Matched against `req.originalUrl` exactly.
 */
const SILENT_PATHS: readonly string[] = ['/api/health', '/health'];

/**
 * F11 (2026-04-30) — Redacts sensitive query-string keys from a URL before logging.
 * Mirrors the redaction list owned by `sentry-scrubber.ts` so the request logger and
 * the Sentry transport apply the same rules (single source of truth).
 *
 * @param originalUrl - Express `req.originalUrl` (path + querystring).
 */
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

/** Logs each completed HTTP request with method, path, status, latency, and request ID. */
export const requestLoggerMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const startedAt = Date.now();
  const requestId = (req as Request & { requestId?: string }).requestId;

  res.on('finish', () => {
    if (SILENT_PATHS.includes(req.originalUrl)) {
      return;
    }

    const userId = (req as Request & { user?: { id?: number } }).user?.id;

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
