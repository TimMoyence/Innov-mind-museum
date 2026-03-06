export class HttpError extends Error {
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Resource not found', details?: unknown) {
    super(404, message, details);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends HttpError {
  constructor(message = 'Invalid request payload', details?: unknown) {
    super(400, message, details);
    this.name = 'ValidationError';
  }
}
