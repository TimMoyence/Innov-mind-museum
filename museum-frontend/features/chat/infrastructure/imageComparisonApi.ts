import { httpClient } from '@/shared/infrastructure/httpClient';
import { appendRnFile } from '@/features/chat/infrastructure/chatApi/_internals';
import type { components } from '@/shared/api/generated/openapi';

/** Backend `CompareResult` payload — derived from the generated OpenAPI types. */
export type CompareResult = components['schemas']['CompareResult'];

/**
 * Input for the image compare mutation. The image is provided in React
 * Native's `{ uri, name, type }` shape (i.e. straight from
 * `expo-image-picker`); the rest of the fields drive backend parameters.
 */
export interface CompareInput {
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

/**
 * Image comparison façade.
 *
 * C1 hexagonal (2026-05-23) — wraps the multipart `POST /api/chat/compare`.
 * Uses `httpClient.post` directly (NOT `openApiRequest`) on purpose: the
 * consuming hook (`useCompareImage`) reads `error.response.status` and
 * `error.response.data.error.code` to map 503 / `COMPARE_ENCODER_UNAVAILABLE`
 * to a user-facing i18n string. Going through `openApiRequest` / `httpRequest`
 * would wrap the error in an `AppError` via `mapAxiosError`, which would
 * erase that axios-error shape — the hook needs the raw axios envelope.
 *
 * Therefore: errors propagate UNTOUCHED. The hook owns i18n + retry policy.
 */
export const imageComparisonApi = {
  /**
   * POSTs a multipart `image + sessionId + topK + locale` payload and returns
   * the unwrapped `CompareResult`. Axios errors propagate as-is so the caller
   * can branch on `error.response.{status,data.error.code}`.
   */
  async compare(input: CompareInput): Promise<CompareResult> {
    const formData = new FormData();
    appendRnFile(formData, 'image', input.image);
    formData.append('sessionId', input.sessionId);
    if (input.topK !== undefined) {
      formData.append('topK', String(input.topK));
    }
    if (input.locale) {
      formData.append('locale', input.locale);
    }

    const response = await httpClient.post<CompareResult>(COMPARE_ENDPOINT, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
};
