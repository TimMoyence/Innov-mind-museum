/**
 * `useCompareImage` — React Query mutation for the visual-similarity compare
 * pipeline (T8.1, Phase 8 / C3 Image Comparative).
 *
 * Delegates the wire call to `features/chat/infrastructure/imageComparisonApi`
 * (C1 hexagonal 2026-05-23). This hook keeps the responsibilities the service
 * intentionally does NOT own:
 *   - i18n mapping (`chat.compare.error.unavailable`) for 503 /
 *     `COMPARE_ENCODER_UNAVAILABLE`.
 *   - React Query retry policy (5xx → up to 2 attempts, 4xx terminal).
 *
 * Behaviours under test (`__tests__/features/chat/application/useCompareImage.test.ts`):
 *  - Idle initial state.
 *  - Success path returns the raw backend `CompareResult`.
 *  - Network failure surfaces an `error` with no `data`.
 *  - 503 + `COMPARE_ENCODER_UNAVAILABLE` → mapped to a stable user-friendly
 *    message (i18n key `chat.compare.error.unavailable`); the raw axios
 *    detail (`encoder down`) is never leaked to the consumer.
 *  - 4xx is terminal — no retry. 5xx is retried up to 2 attempts.
 */
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

/**
 * Input for the compare mutation. The image is provided in React Native's
 * `{ uri, name, type }` shape (i.e. straight from `expo-image-picker`); the
 * rest of the fields drive backend parameters.
 *
 * Re-exported as the historical `UseCompareImageInput` name for back-compat
 * with components that imported it from this module.
 */
export type UseCompareImageInput = CompareInput;

/** Internal narrow shape we read off thrown errors (axios-like). */
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

/** Reads `error.response.status` defensively. */
const getStatus = (error: unknown): number | undefined =>
  isAxiosLikeError(error) ? error.response?.status : undefined;

/** Reads `error.response.data.error.code` defensively. */
const getErrorCode = (error: unknown): string | undefined =>
  isAxiosLikeError(error) ? error.response?.data?.error?.code : undefined;

/** Default retry policy: 4xx terminal, 5xx retried up to 2 attempts. */
const defaultRetry: NonNullable<
  UseMutationOptions<CompareResult, Error, UseCompareImageInput>['retry']
> = (failureCount, error) => {
  const status = getStatus(error);
  if (status !== undefined && status >= 400 && status < 500) {
    return false;
  }
  return failureCount < 2;
};

/** Optional overrides for the compare mutation. */
export interface UseCompareImageOptions {
  /**
   * Retry policy override. Consumers that surface errors on a tight UX budget
   * (e.g. the in-screen compare trigger, which must show the i18n error
   * promptly) pass `false` to skip the 5xx back-off. Defaults to the
   * 4xx-terminal / 5xx-retried policy.
   */
  readonly retry?: UseMutationOptions<CompareResult, Error, UseCompareImageInput>['retry'];
}

/**
 * React Query mutation wrapper around `imageComparisonApi.compare`.
 *
 * Returns the standard `useMutation()` result shape; consumers should read
 * `data` (the `CompareResult`) and `error` (a normalised `Error`).
 */
export const useCompareImage = (
  options?: UseCompareImageOptions,
): UseMutationResult<CompareResult, Error, UseCompareImageInput> => {
  const { t } = useTranslation();

  return useMutation<CompareResult, Error, UseCompareImageInput>({
    mutationFn: async (input) => {
      try {
        return await imageComparisonApi.compare(input);
      } catch (error) {
        // 503 + encoder-unavailable → stable user-facing message keyed off i18n.
        // We never let the raw axios "encoder down" detail bubble up to UI.
        const status = getStatus(error);
        const code = getErrorCode(error);
        if (status === 503 || code === 'COMPARE_ENCODER_UNAVAILABLE') {
          throw new Error(t('chat.compare.error.unavailable'));
        }
        throw error instanceof Error ? error : new Error(String(error));
      }
    },
    /**
     * Retry policy: 4xx is terminal (client did something wrong — no point
     * resending the same payload), 5xx is transient and worth a retry. We
     * stop after `failureCount` reaches 2 to bound user-perceived latency.
     * Overridable so the in-screen trigger can opt out (prompt error UX).
     */
    retry: options?.retry ?? defaultRetry,
  });
};
