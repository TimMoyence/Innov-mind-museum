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

export const tooManyRequests = (message: string): AppError => {
  return new AppError({
    message,
    statusCode: 429,
    code: 'TOO_MANY_REQUESTS',
  });
};
