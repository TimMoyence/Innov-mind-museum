import { useTranslation } from 'react-i18next';
import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from '@tanstack/react-query';

import {
  imageComparisonApi,
  type CompareInput,
  type CompareResult,
} from '@/features/chat/infrastructure/imageComparisonApi';

export type UseCompareImageInput = CompareInput;

interface AxiosLikeError {
  response?: {
    status?: number;
    data?: {
      error?: {
        code?: string;
        message?: string;
      };
    };
  };
}

const isAxiosLikeError = (value: unknown): value is AxiosLikeError =>
  !!value && typeof value === 'object' && 'response' in value;

const getStatus = (error: unknown): number | undefined =>
  isAxiosLikeError(error) ? error.response?.status : undefined;

const getErrorCode = (error: unknown): string | undefined =>
  isAxiosLikeError(error) ? error.response?.data?.error?.code : undefined;

const defaultRetry: NonNullable<
  UseMutationOptions<CompareResult, Error, UseCompareImageInput>['retry']
> = (failureCount, error) => {
  const status = getStatus(error);
  if (status !== undefined && status >= 400 && status < 500) {
    return false;
  }
  return failureCount < 2;
};

export interface UseCompareImageOptions {
  readonly retry?: UseMutationOptions<CompareResult, Error, UseCompareImageInput>['retry'];
}

export const useCompareImage = (
  options?: UseCompareImageOptions,
): UseMutationResult<CompareResult, Error, UseCompareImageInput> => {
  const { t } = useTranslation();

  return useMutation<CompareResult, Error, UseCompareImageInput>({
    mutationFn: async (input) => {
      try {
        return await imageComparisonApi.compare(input);
      } catch (error) {
        const status = getStatus(error);
        const code = getErrorCode(error);
        if (status === 503 || code === 'COMPARE_ENCODER_UNAVAILABLE') {
          throw new Error(t('chat.compare.error.unavailable'));
        }
        throw error instanceof Error ? error : new Error(String(error));
      }
    },
    retry: options?.retry ?? defaultRetry,
  });
};
