export type AppErrorKind =
  | 'Network'
  | 'Unauthorized'
  | 'Forbidden'
  | 'NotFound'
  | 'Validation'
  | 'Timeout'
  | 'Unknown';

export interface AppError {
  kind: AppErrorKind;
  message: string;
  status?: number;
  details?: unknown;
}

export const createAppError = (params: AppError): AppError & Error => {
  const error = new Error(params.message) as AppError & Error;
  error.kind = params.kind;
  error.status = params.status;
  error.details = params.details;
  return error;
};
