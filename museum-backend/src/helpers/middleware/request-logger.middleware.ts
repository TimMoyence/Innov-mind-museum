import type { Request, Response, NextFunction } from 'express';

import { logger } from '@shared/logger/logger';

/** Logs each completed HTTP request with method, path, status, latency, and request ID. */
export const requestLoggerMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const startedAt = Date.now();
  const requestId = (req as Request & { requestId?: string }).requestId;

  res.on('finish', () => {
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
