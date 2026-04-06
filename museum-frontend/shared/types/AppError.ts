/** Discriminated category for application-level errors. */
type AppErrorKind =
  | 'Network'
  | 'Unauthorized'
  | 'Forbidden'
  | 'NotFound'
  | 'Validation'
  | 'RateLimited'
  | 'Timeout'
  | 'Unknown';

/** Structured application error with a discriminating kind, human message, and optional HTTP status. */
export interface AppError {
  kind: AppErrorKind;
  message: string;
  /** HTTP status code when the error originated from an API response. */
  status?: number;
  /** Arbitrary context attached for debugging or logging. */
  details?: unknown;
  /** Backend request ID for cross-referencing server logs. */
  requestId?: string;
  /** Set to `true` after the error has been reported to Sentry to prevent double-capture. */
  _reported?: boolean;
}

/**
 * Creates an {@link AppError} that also extends the native `Error` prototype.
 * @param params - Error descriptor with kind, message, and optional fields.
 * @returns A value that is both an `Error` and an `AppError`.
 */
export const createAppError = (params: AppError): AppError & Error => {
  const error = new Error(params.message) as AppError & Error;
  error.kind = params.kind;
  error.status = params.status;
  error.details = params.details;
  error.requestId = params.requestId;
  return error;
};
