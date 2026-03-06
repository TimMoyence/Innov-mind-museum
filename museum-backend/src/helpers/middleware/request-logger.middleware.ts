import type { RequestHandler } from 'express';

import { logger } from '@shared/logger/logger';

export const requestLoggerMiddleware: RequestHandler = (req, res, next) => {
  const startedAt = Date.now();
  const requestId =
    (req as { requestId?: string } | undefined)?.requestId || undefined;

  res.on('finish', () => {
    logger.info('http_request', {
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      latencyMs: Date.now() - startedAt,
      ip: req.ip,
    });
  });

  next();
};
