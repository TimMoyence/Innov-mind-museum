import {
  useQuery,
  type UseQueryOptions,
  type UseQueryResult,
  type QueryKey,
} from '@tanstack/react-query';

import type { AppError } from '@/shared/types/AppError';

export const useAppQuery = <TData, TQueryKey extends QueryKey = QueryKey>(
  options: UseQueryOptions<TData, AppError, TData, TQueryKey>,
): UseQueryResult<TData, AppError> => {
  return useQuery<TData, AppError, TData, TQueryKey>(options);
};
