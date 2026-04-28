import { logger } from '@shared/logger/logger';

import type { Request, Response, NextFunction } from 'express';

/**
 * Paths whose successful traffic is too noisy to log (health checks polled by uptime monitors,
 * load balancers, and CI smoke tests). Matched against `req.originalUrl` exactly.
 */
const SILENT_PATHS: readonly string[] = ['/api/health', '/health'];

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
      path: req.originalUrl,
      statusCode: res.statusCode,
      latencyMs: Date.now() - startedAt,
      ip: req.ip,
      ...(userId != null && { userId }),
    });
  });

  next();
};
