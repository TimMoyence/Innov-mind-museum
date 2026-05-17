export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;
  /** Applied by error middleware (e.g. Retry-After on 429). */
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
 * Strict-input validation failure (e.g. Wikidata QID, SPARQL literal control chars).
 * Distinct subclass for `toThrow(ValidationError)` assertions. Always 400/`VALIDATION_ERROR`.
 * Extends AppError so error middleware maps to 400 (previously degraded to 500).
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super({ message, statusCode: 400, code: 'VALIDATION_ERROR', details });
    this.name = 'ValidationError';
  }
}

export const badRequest = (message: string, details?: unknown): AppError => {
  return new AppError({
    message,
    details,
    statusCode: 400,
    code: 'BAD_REQUEST',
  });
};

export const notFound = (message: string, details?: unknown): AppError => {
  return new AppError({
    message,
    details,
    statusCode: 404,
    code: 'NOT_FOUND',
  });
};

export const conflict = (message: string): AppError => {
  return new AppError({
    message,
    statusCode: 409,
    code: 'CONFLICT',
  });
};

export const forbidden = (message: string): AppError => {
  return new AppError({
    message,
    statusCode: 403,
    code: 'FORBIDDEN',
  });
};

/** `retryAfterSec` sets Retry-After header (clamped ≥1s). */
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

/** `retryAfterSec` sets Retry-After header (clamped ≥1s). */
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

export const unauthorized = (message: string): AppError => {
  return new AppError({
    message,
    statusCode: 401,
    code: 'UNAUTHORIZED',
  });
};

/** C3 — POST /chat/compare: missing image / unsupported MIME / magic-byte / OCR-injection fail (R6/R12). FE branches on code to prompt retake. */
export const compareInvalidImage = (message: string, details?: unknown): AppError => {
  return new AppError({
    message,
    statusCode: 400,
    code: 'COMPARE_INVALID_IMAGE',
    details,
  });
};

/** C3 — POST /chat/compare: topK outside [1, 10] (R17). FE branches on code to clamp carousel. */
export const compareInvalidTopK = (message: string, details?: unknown): AppError => {
  return new AppError({
    message,
    statusCode: 400,
    code: 'COMPARE_INVALID_TOPK',
    details,
  });
};

/** C3 — POST /chat/compare: OCR/prompt-injection guardrail blocked (R18). FE surfaces message verbatim. */
export const compareGuardrailBlocked = (message: string, details?: unknown): AppError => {
  return new AppError({
    message,
    statusCode: 400,
    code: 'COMPARE_GUARDRAIL_BLOCKED',
    details,
  });
};
