/**
 * `useCompareImage` — React Query mutation for the visual-similarity compare
 * pipeline (T8.1, Phase 8 / C3 Image Comparative).
 *
 * Posts a multipart `image + sessionId + topK + locale` payload to
 * `POST /api/chat/compare` and exposes the standard React Query mutation
 * surface (`mutate`, `mutateAsync`, `data`, `error`, `isPending`, …).
 *
 * Behaviours under test (`__tests__/features/chat/application/useCompareImage.test.ts`):
 *  - Idle initial state.
 *  - Success path returns the raw backend `CompareResult`.
 *  - Network failure surfaces an `error` with no `data`.
 *  - 503 + `COMPARE_ENCODER_UNAVAILABLE` → mapped to a stable user-friendly
 *    message (i18n key `chat.compare.error.unavailable`); the raw axios
 *    detail (`encoder down`) is never leaked to the consumer.
 *  - 4xx is terminal — no retry. 5xx is retried up to 2 attempts (the inner
 *    `httpClient` axios interceptor already retries 5xx/429 transparently;
 *    this mutation-level retry is the safety net when those interceptors
 *    are bypassed, e.g. in tests with a mocked client).
 */
import { useTranslation } from 'react-i18next';
import { useMutation, type UseMutationResult } from '@tanstack/react-query';

import { httpClient } from '@/shared/infrastructure/httpClient';
import { appendRnFile } from '@/features/chat/infrastructure/chatApi/_internals';
import type { components } from '@/shared/api/generated/openapi';

type CompareResult = components['schemas']['CompareResult'];

/**
 * Input for the compare mutation. The image is provided in React Native's
 * `{ uri, name, type }` shape (i.e. straight from `expo-image-picker`); the
 * rest of the fields drive backend parameters.
 */
export interface UseCompareImageInput {
  /** RN-shaped image file as returned by the image picker. */
  image: { uri: string; name: string; type: string };
  /** Chat session this compare call is associated with. */
  sessionId: string;
  /** Number of matches requested, default 5 (server clamps to [1, 10]). */
  topK?: number;
  /** Locale for templated rationales / artwork facts. */
  locale?: 'fr' | 'en';
}

/** Path of the compare endpoint, mounted under the `/api` prefix server-side. */
const COMPARE_ENDPOINT = '/api/chat/compare';

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

/** Builds the multipart body for the compare endpoint. */
const buildFormData = (input: UseCompareImageInput): FormData => {
  const formData = new FormData();
  appendRnFile(formData, 'image', input.image);
  formData.append('sessionId', input.sessionId);
  if (input.topK !== undefined) {
    formData.append('topK', String(input.topK));
  }
  if (input.locale) {
    formData.append('locale', input.locale);
  }
  return formData;
};

/**
 * React Query mutation wrapper around `POST /api/chat/compare`.
 *
 * Returns the standard `useMutation()` result shape; consumers should read
 * `data` (the `CompareResult`) and `error` (a normalised `Error`).
 */
export const useCompareImage = (): UseMutationResult<
  CompareResult,
  Error,
  UseCompareImageInput
> => {
  const { t } = useTranslation();

  return useMutation<CompareResult, Error, UseCompareImageInput>({
    mutationFn: async (input) => {
      const formData = buildFormData(input);
      try {
        const response = await httpClient.post<CompareResult>(COMPARE_ENDPOINT, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        return response.data;
      } catch (error) {
        // 503 + encoder-unavailable → stable user-facing message keyed off i18n.
        // We never let the raw axios "encoder down" detail bubble up to UI.
        const status = getStatus(error);
        const code = getErrorCode(error);
        if (status === 503 || code === 'COMPARE_ENCODER_UNAVAILABLE') {
          throw new Error(t('chat.compare.error.unavailable'));
        }
        // Other errors propagate as-is; `getErrorMessage()` (consumer-side)
        // already knows how to translate AppErrors.
        throw error instanceof Error ? error : new Error(String(error));
      }
    },
    /**
     * Retry policy: 4xx is terminal (client did something wrong — no point
     * resending the same payload), 5xx is transient and worth a retry. We
     * stop after `failureCount` reaches 2 to bound user-perceived latency.
     */
    retry: (failureCount, error) => {
      const status = getStatus(error);
      if (status !== undefined && status >= 400 && status < 500) {
        return false;
      }
      return failureCount < 2;
    },
  });
};
