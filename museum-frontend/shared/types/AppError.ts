export type AppErrorKind =
  | 'Network'
  | 'Unauthorized'
  | 'Forbidden'
  | 'NotFound'
  | 'Validation'
  | 'RateLimited'
  | 'DailyLimitReached'
  | 'Timeout'
  | 'SocialAuth'
  | 'Contract'
  | 'Streaming'
  | 'Location'
  | 'OfflinePack'
  | 'Review'
  | 'Unknown';

export interface AppError {
  kind: AppErrorKind;
  code?: string;
  message: string;
  status?: number;
  details?: unknown;
  requestId?: string;
  _reported?: boolean;
}

export const createAppError = (params: AppError): AppError & Error => {
  const error = new Error(params.message) as AppError & Error;
  error.kind = params.kind;
  if (params.code !== undefined) error.code = params.code;
  error.status = params.status;
  error.details = params.details;
  error.requestId = params.requestId;
  return error;
};
