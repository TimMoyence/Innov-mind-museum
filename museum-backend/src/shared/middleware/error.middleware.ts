import { MulterError } from 'multer';

import { AppError } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { captureExceptionWithContext } from '@shared/observability/sentry';

import type { ErrorRequestHandler, Response, Request } from 'express';

interface ErrorResponseShape {
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: unknown;
  };
}

/**
 * Duck-typed — `instanceof AppError` breaks across module boundaries when Jest calls
 * `jest.resetModules()` (e2e harness reset). Two distinct AppError class identities
 * end up coexisting; pre-reset AppError throws look "unknown" → degrade to 500.
 */
const isAppErrorLike = (error: unknown): error is AppError => {
  if (error instanceof AppError) return true;
  if (!(error instanceof Error)) return false;
  const candidate = error as Error & { statusCode?: unknown; code?: unknown };
  return typeof candidate.statusCode === 'number' && typeof candidate.code === 'string';
};

/**
 * Multer DoS bounds (`limits.fields` / `limits.parts` / `limits.fileSize` /
 * `limits.fieldNameSize` / `limits.fieldSize`) all guard resource exhaustion
 * — exceeding them is "payload too large" semantics (413), not a malformed
 * request (400). File-count / unexpected-field overruns stay 400 because
 * they are semantic request shape errors, not size overruns (cf. TD-MUL-02
 * which keeps `LIMIT_FILE_COUNT` / `LIMIT_UNEXPECTED_FILE` on 400).
 */
const MULTER_PAYLOAD_TOO_LARGE_CODES = new Set<MulterError['code']>([
  'LIMIT_FILE_SIZE',
  'LIMIT_PART_COUNT',
  'LIMIT_FIELD_COUNT',
  'LIMIT_FIELD_KEY',
  'LIMIT_FIELD_VALUE',
]);

const MULTER_413_MESSAGES: Partial<Record<MulterError['code'], string>> = {
  LIMIT_FILE_SIZE: 'File too large',
  LIMIT_PART_COUNT: 'Too many parts',
  LIMIT_FIELD_COUNT: 'Too many fields',
  LIMIT_FIELD_KEY: 'Field name too long',
  LIMIT_FIELD_VALUE: 'Field value too long',
};

const normalizeError = (error: unknown): unknown => {
  if (error instanceof MulterError) {
    if (MULTER_PAYLOAD_TOO_LARGE_CODES.has(error.code)) {
      return new AppError({
        message: MULTER_413_MESSAGES[error.code] ?? 'Payload too large',
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

/** Scoped to `/api/auth/` only — avoid flooding logs with every wrong password attempt. */
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
