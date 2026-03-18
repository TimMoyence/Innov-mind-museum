/** Represents a structured application error with an HTTP status code and machine-readable code. */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(params: {
    message: string;
    statusCode?: number;
    code?: string;
    details?: unknown;
  }) {
    super(params.message);
    this.name = 'AppError';
    this.statusCode = params.statusCode ?? 500;
    this.code = params.code ?? 'INTERNAL_ERROR';
    this.details = params.details;
  }
}

/**
 * Creates a 400 Bad Request AppError.
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
 * Creates a 429 Too Many Requests AppError.
 * @param message - Human-readable error description.
 * @returns AppError with status 429.
 */
export const tooManyRequests = (message: string): AppError => {
  return new AppError({
    message,
    statusCode: 429,
    code: 'TOO_MANY_REQUESTS',
  });
};
