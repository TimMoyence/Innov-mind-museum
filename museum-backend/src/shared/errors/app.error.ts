/** Represents a structured application error with an HTTP status code and machine-readable code. */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;
  /** Optional HTTP response headers (e.g. Retry-After on 429) applied by the error middleware. */
  readonly headers?: Record<string, string>;

  constructor(params: {
    message: string;
    statusCode?: number;
    code?: string;
    details?: unknown;
    headers?: Record<string, string>;
  }) {
    super(params.message);
    this.name = 'AppError';
    this.statusCode = params.statusCode ?? 500;
    this.code = params.code ?? 'INTERNAL_ERROR';
    this.details = params.details;
    this.headers = params.headers;
  }
}

/**
 * Thrown when caller-supplied input fails strict validation
 * (e.g. Wikidata QID format, SPARQL literal control chars).
 *
 * Distinct subclass so tests can assert on type via `toThrow(ValidationError)`
 * without falsely matching unrelated 400 errors. Always 400/`VALIDATION_ERROR`.
 *
 * Extends `AppError` so the global error middleware maps it to a 400 response
 * automatically (previously it inherited `Error` directly and degraded to 500).
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super({ message, statusCode: 400, code: 'VALIDATION_ERROR', details });
    this.name = 'ValidationError';
  }
}

/**
 * Creates a 400 Bad Request AppError.
 *
 * @param message - Human-readable error description.
 * @param details - Optional payload with validation details.
 * @returns AppError with status 400.
 */
export const badRequest = (message: string, details?: unknown): AppError => {
  return new AppError({
    message,
    details,
    statusCode: 400,
    code: 'BAD_REQUEST',
  });
};

/**
 * Creates a 404 Not Found AppError.
 *
 * @param message - Human-readable error description.
 * @param details - Optional additional context.
 * @returns AppError with status 404.
 */
export const notFound = (message: string, details?: unknown): AppError => {
  return new AppError({
    message,
    details,
    statusCode: 404,
    code: 'NOT_FOUND',
  });
};

/**
 * Creates a 409 Conflict AppError.
 *
 * @param message - Human-readable error description.
 * @returns AppError with status 409.
 */
export const conflict = (message: string): AppError => {
  return new AppError({
    message,
    statusCode: 409,
    code: 'CONFLICT',
  });
};

/**
 * Creates a 403 Forbidden AppError.
 *
 * @param message - Human-readable error description.
 * @returns AppError with status 403.
 */
export const forbidden = (message: string): AppError => {
  return new AppError({
    message,
    statusCode: 403,
    code: 'FORBIDDEN',
  });
};

/**
 * Creates a 429 Too Many Requests AppError.
 *
 * @param message - Human-readable error description.
 * @param options - Optional modifiers for the error payload.
 * @param options.retryAfterSec - Seconds until the client may retry; sets the Retry-After header.
 * @param options.code - Overrides the default `TOO_MANY_REQUESTS` machine code.
 * @param options.details - Structured details to attach to the error response.
 * @returns AppError with status 429.
 */
export const tooManyRequests = (
  message: string,
  options?: { retryAfterSec?: number; code?: string; details?: unknown },
): AppError => {
  const retryAfterSec = options?.retryAfterSec;
  const headers =
    retryAfterSec !== undefined
      ? { 'Retry-After': String(Math.max(1, Math.ceil(retryAfterSec))) }
      : undefined;
  const details = options?.details ?? (retryAfterSec !== undefined ? { retryAfterSec } : undefined);
  return new AppError({
    message,
    statusCode: 429,
    code: options?.code ?? 'TOO_MANY_REQUESTS',
    details,
    headers,
  });
};

/**
 * Creates a 503 Service Unavailable AppError.
 *
 * @param message - Human-readable error description.
 * @param options - Optional modifiers for the error payload.
 * @param options.retryAfterSec - Seconds until the client may retry; sets the Retry-After header.
 * @param options.code - Overrides the default `SERVICE_UNAVAILABLE` machine code.
 * @param options.details - Structured details to attach to the error response.
 * @returns AppError with status 503.
 */
export const serviceUnavailable = (
  message: string,
  options?: { retryAfterSec?: number; code?: string; details?: unknown },
): AppError => {
  const retryAfterSec = options?.retryAfterSec;
  const headers =
    retryAfterSec !== undefined
      ? { 'Retry-After': String(Math.max(1, Math.ceil(retryAfterSec))) }
      : undefined;
  return new AppError({
    message,
    statusCode: 503,
    code: options?.code ?? 'SERVICE_UNAVAILABLE',
    details: options?.details,
    headers,
  });
};

/**
 * Creates a 401 Unauthorized error.
 *
 * @param message - Error description.
 * @returns AppError with status 401.
 */
export const unauthorized = (message: string): AppError => {
  return new AppError({
    message,
    statusCode: 401,
    code: 'UNAUTHORIZED',
  });
};
