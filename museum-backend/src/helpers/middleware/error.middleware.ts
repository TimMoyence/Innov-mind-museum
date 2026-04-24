import { MulterError } from 'multer';

import { AppError } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { captureExceptionWithContext } from '@shared/observability/sentry';

import type { ErrorRequestHandler, Response, Request } from 'express';

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

const buildPayload = (error: unknown, requestId: string | undefined): ErrorResponseShape => {
  const isKnown = error instanceof AppError;
  return {
    error: {
      code: isKnown ? error.code : 'INTERNAL_ERROR',
      message: isKnown ? error.message : 'Internal server error',
      requestId,
      ...(isKnown && error.details ? { details: error.details } : {}),
    },
  };
};

const applyResponseHeaders = (res: Response, error: unknown): void => {
  if (!(error instanceof AppError) || !error.headers) return;
  for (const [name, value] of Object.entries(error.headers)) {
    res.setHeader(name, value);
  }
};

const logServerError = (error: unknown, req: Request, requestId: string | undefined): void => {
  captureExceptionWithContext(error, {
    requestId,
    method: req.method,
    path: req.originalUrl,
  });
  logger.error('request_failed', {
    requestId,
    method: req.method,
    path: req.originalUrl,
    statusCode: error instanceof AppError ? error.statusCode : 500,
    error: error instanceof Error ? error.message : String(error),
  });
};

/** Express error-handling middleware that maps AppError instances to structured JSON responses and logs 5xx errors. */
export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const normalizedError = normalizeError(error);
  const requestId = (req as { requestId?: string } | undefined)?.requestId ?? undefined;
  const statusCode = normalizedError instanceof AppError ? normalizedError.statusCode : 500;

  if (statusCode >= 500) {
    logServerError(normalizedError, req, requestId);
  }

  applyResponseHeaders(res, normalizedError);
  res.status(statusCode).json(buildPayload(normalizedError, requestId));
};
