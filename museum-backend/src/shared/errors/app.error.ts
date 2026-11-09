export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;
  readonly headers?: Record<string, string>;
  readonly inputRejected: boolean;

  constructor(params: {
    message: string;
    statusCode?: number;
    code?: string;
    details?: unknown;
    headers?: Record<string, string>;
    inputRejected?: boolean;
  }) {
    super(params.message);
    this.name = 'AppError';
    this.statusCode = params.statusCode ?? 500;
    this.code = params.code ?? 'INTERNAL_ERROR';
    this.details = params.details;
    this.headers = params.headers;
    this.inputRejected = params.inputRejected ?? false;
  }
}

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

export const invalidInput = (message: string): AppError =>
  new AppError({ message, statusCode: 400, code: 'BAD_REQUEST', inputRejected: true });

export const countedRefusal = (error: unknown): unknown =>
  error instanceof AppError && error.inputRejected
    ? new AppError({
        message: error.message,
        statusCode: error.statusCode,
        code: error.code,
        details: error.details,
        headers: error.headers,
      })
    : error;

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

export const unauthorized = (message: string, code = 'UNAUTHORIZED'): AppError => {
  return new AppError({
    message,
    statusCode: 401,
    code,
  });
};

export const compareInvalidImage = (
  message: string,
  details?: unknown,
  inputRejected = false,
): AppError => {
  return new AppError({
    message,
    statusCode: 400,
    code: 'COMPARE_INVALID_IMAGE',
    details,
    inputRejected,
  });
};

export const compareInvalidTopK = (message: string, details?: unknown): AppError => {
  return new AppError({
    message,
    statusCode: 400,
    code: 'COMPARE_INVALID_TOPK',
    details,
    inputRejected: true,
  });
};

export const compareGuardrailBlocked = (message: string, details?: unknown): AppError => {
  return new AppError({
    message,
    statusCode: 400,
    code: 'COMPARE_GUARDRAIL_BLOCKED',
    details,
  });
};
