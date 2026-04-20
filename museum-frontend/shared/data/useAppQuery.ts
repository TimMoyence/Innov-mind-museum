import {
  useQuery,
  type UseQueryOptions,
  type UseQueryResult,
  type QueryKey,
} from '@tanstack/react-query';

import type { AppError } from '@/shared/types/AppError';

/**
 * Thin wrapper around {@link useQuery} that narrows the error type to
 * {@link AppError}. The HTTP kernel already maps every AxiosError into an
 * AppError, so consumers can rely on structured error handling and
 * `getErrorMessage()` on the returned `error` without any casting.
 */
export const useAppQuery = <TData, TQueryKey extends QueryKey = QueryKey>(
  options: UseQueryOptions<TData, AppError, TData, TQueryKey>,
): UseQueryResult<TData, AppError> => {
  return useQuery<TData, AppError, TData, TQueryKey>(options);
};
