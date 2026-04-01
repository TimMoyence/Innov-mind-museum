import { MulterError } from 'multer';

import { AppError } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { captureExceptionWithContext } from '@shared/observability/sentry';

import type { ErrorRequestHandler } from 'express';

/** Shape of the JSON error response sent to clients. */
interface ErrorResponseShape {
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: unknown;
  };
}

const normalizeError = (error: unknown): unknown => {
  if (error instanceof MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return new AppError({
        message: 'File too large',
        statusCode: 413,
        code: 'PAYLOAD_TOO_LARGE',
      });
    }

    return new AppError({
      message: error.message,
      statusCode: 400,
      code: 'BAD_REQUEST',
    });
  }

  return error;
};

/** Express error-handling middleware that maps AppError instances to structured JSON responses and logs 5xx errors. */
export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const normalizedError = normalizeError(error);
  const requestId = (req as { requestId?: string } | undefined)?.requestId ?? undefined;
  const isKnown = normalizedError instanceof AppError;
  const statusCode = isKnown ? normalizedError.statusCode : 500;
  const payload: ErrorResponseShape = {
    error: {
      code: isKnown ? normalizedError.code : 'INTERNAL_ERROR',
      message: isKnown ? normalizedError.message : 'Internal server error',
      requestId,
      ...(isKnown && normalizedError.details ? { details: normalizedError.details } : {}),
    },
  };

  if (statusCode >= 500) {
    captureExceptionWithContext(normalizedError, {
      requestId,
      method: req.method,
      path: req.originalUrl,
    });
    logger.error('request_failed', {
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode,
      error: normalizedError instanceof Error ? normalizedError.message : String(normalizedError),
    });
  }

  res.status(statusCode).json(payload);
};
