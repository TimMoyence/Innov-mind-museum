import type { ErrorRequestHandler } from 'express';

import { logger } from '@shared/logger/logger';
import { AppError } from '@shared/errors/app.error';
import { captureExceptionWithContext } from '@shared/observability/sentry';

/** Shape of the JSON error response sent to clients. */
interface ErrorResponseShape {
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: unknown;
  };
}

/** Express error-handling middleware that maps AppError instances to structured JSON responses and logs 5xx errors. */
export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const requestId =
    (req as { requestId?: string } | undefined)?.requestId || undefined;
  const isKnown = error instanceof AppError;
  const statusCode = isKnown ? error.statusCode : 500;
  const payload: ErrorResponseShape = {
    error: {
      code: isKnown ? error.code : 'INTERNAL_ERROR',
      message: isKnown ? error.message : 'Internal server error',
      requestId,
      ...(isKnown && error.details ? { details: error.details } : {}),
    },
  };

  if (statusCode >= 500) {
    captureExceptionWithContext(error, {
      requestId,
      method: req.method,
      path: req.originalUrl,
    });
    logger.error('request_failed', {
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  res.status(statusCode).json(payload);
};
