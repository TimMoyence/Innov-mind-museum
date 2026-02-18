import type { AppError } from '@/shared/types/AppError';

export const isAppError = (error: unknown): error is AppError => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  return 'kind' in error && 'message' in error;
};

export const getErrorMessage = (error: unknown): string => {
  if (isAppError(error)) {
    switch (error.kind) {
      case 'Network':
        return 'Network unavailable. Check your connection and try again.';
      case 'Unauthorized':
        return 'Please sign in again.';
      case 'Forbidden':
        return 'You do not have access to this action.';
      case 'NotFound':
        return 'The requested resource was not found.';
      case 'Validation':
        return 'Please review your input and try again.';
      case 'Timeout':
        return 'Request timed out. Please retry.';
      default:
        return error.message || 'Something went wrong. Please try again.';
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong. Please try again.';
};
