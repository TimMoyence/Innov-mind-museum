import { useMutation, type UseMutationResult } from '@tanstack/react-query';

import {
  imageComparisonApi,
  type CompareInput,
  type CompareResult,
} from '@/features/chat/infrastructure/imageComparisonApi';

export const useCompareImage = (): UseMutationResult<CompareResult, Error, CompareInput> =>
  useMutation<CompareResult, Error, CompareInput>({
    mutationFn: (input) => imageComparisonApi.compare(input),
    retry: false,
  });
