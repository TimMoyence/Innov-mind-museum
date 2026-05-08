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

/**
 * Duck-typed AppError check. Plain `instanceof AppError` breaks across module
 * boundaries when Jest calls `jest.resetModules()` (e2e harness reset for
 * multi-container test files): the orchestrator and middleware end up holding
 * two distinct AppError class identities, so an AppError thrown by code from
 * pre-reset modules looks "unknown" to the middleware and degrades to 500.
 * The `name` + `statusCode` shape uniquely identifies our errors.
 */
const isAppErrorLike = (error: unknown): error is AppError => {
  if (error instanceof AppError) return true;
  if (!(error instanceof Error)) return false;
  const candidate = error as Error & { statusCode?: unknown; code?: unknown };
  return typeof candidate.statusCode === 'number' && typeof candidate.code === 'string';
};

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
  const isKnown = isAppErrorLike(error);
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
  if (!isAppErrorLike(error) || !error.headers) return;
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
    statusCode: isAppErrorLike(error) ? error.statusCode : 500,
    error: error instanceof Error ? error.message : String(error),
  });
};

/**
 * Logs auth-path 4xx with the AppError `code` so we can see *why* an
 * `/api/auth/...` call rejected without scraping the response body. Scoped to
 * `/api/auth/` to avoid flooding logs with every wrong password attempt across
 * the surface; widen if a future incident demands it.
 */
const logAuth4xx = (
  error: unknown,
  req: Request,
  requestId: string | undefined,
  statusCode: number,
): void => {
  if (statusCode < 400 || statusCode >= 500) return;
  if (!req.originalUrl.startsWith('/api/auth/')) return;
  logger.warn('auth_4xx', {
    requestId,
    method: req.method,
    path: req.originalUrl,
    statusCode,
    code: isAppErrorLike(error) ? error.code : 'UNKNOWN',
    message: isAppErrorLike(error) ? error.message : undefined,
  });
};

/** Express error-handling middleware that maps AppError instances to structured JSON responses and logs 5xx errors. */
export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const normalizedError = normalizeError(error);
  const requestId = (req as { requestId?: string } | undefined)?.requestId ?? undefined;
  const statusCode = isAppErrorLike(normalizedError) ? normalizedError.statusCode : 500;

  if (statusCode >= 500) {
    logServerError(normalizedError, req, requestId);
  } else {
    logAuth4xx(normalizedError, req, requestId, statusCode);
  }

  applyResponseHeaders(res, normalizedError);
  res.status(statusCode).json(buildPayload(normalizedError, requestId));
};
