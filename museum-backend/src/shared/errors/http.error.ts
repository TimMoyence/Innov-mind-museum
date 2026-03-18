/** Represents a generic HTTP error with a status code. */
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

/** Represents a 404 Not Found HTTP error. */
export class NotFoundError extends HttpError {
  constructor(message = 'Resource not found', details?: unknown) {
    super(404, message, details);
    this.name = 'NotFoundError';
  }
}

/** Represents a 400 Validation HTTP error for invalid request payloads. */
export class ValidationError extends HttpError {
  constructor(message = 'Invalid request payload', details?: unknown) {
    super(400, message, details);
    this.name = 'ValidationError';
  }
}
