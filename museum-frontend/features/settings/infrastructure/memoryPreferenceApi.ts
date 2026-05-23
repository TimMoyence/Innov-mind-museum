import { openApiRequest, type OpenApiJsonRequestBodyFor } from '@/shared/api/openapiClient';
import type { paths } from '@/shared/api/generated/openapi';

type GetResponse =
  paths['/api/chat/memory/preference']['get']['responses'][200]['content']['application/json'];
type PatchResponse =
  paths['/api/chat/memory/preference']['patch']['responses'][200]['content']['application/json'];
type PatchBody = OpenApiJsonRequestBodyFor<'/api/chat/memory/preference', 'patch'>;

/**
 * Settings — AI memory (personalization) preference façade.
 *
 * C1 hexagonal (2026-05-23) — wraps `GET|PATCH /api/chat/memory/preference`.
 * The `useMemoryPreference` application hook previously imported
 * `openApiRequest` directly (application → transport, hexagonal violation).
 * This service is the only module under `features/settings/**` allowed to
 * touch `@/shared/api/openapiClient`.
 *
 * Types are derived from the generated OpenAPI spec (endpoint present in
 * `paths`). Errors propagate untouched (the underlying `openApiRequest`
 * already maps to `AppError` via `mapAxiosError` inside `httpRequest`).
 */
export const memoryPreferenceApi = {
  /** GET /api/chat/memory/preference — returns `{ enabled }`. */
  async get(): Promise<GetResponse> {
    return openApiRequest({
      path: '/api/chat/memory/preference',
      method: 'get',
    });
  },

  /**
   * PATCH /api/chat/memory/preference with body `{ enabled }`.
   *
   * @param enabled - New preference value.
   * @returns The server-confirmed `{ enabled }` payload.
   */
  async update(enabled: boolean): Promise<PatchResponse> {
    const body: PatchBody = { enabled };
    return openApiRequest({
      path: '/api/chat/memory/preference',
      method: 'patch',
      body: JSON.stringify(body),
    });
  },
};
