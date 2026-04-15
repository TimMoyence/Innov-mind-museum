import { httpRequest } from '@/shared/api/httpRequest';
import { CONTENT_PREFERENCES, type ContentPreference } from '@/shared/types/content-preference';

// Re-export to preserve the existing import paths across the app.
// New code should import directly from '@/shared/types/content-preference'.
export { CONTENT_PREFERENCES, type ContentPreference };

interface UpdateContentPreferencesResponse {
  contentPreferences: ContentPreference[];
}

/**
 * User profile API — currently scoped to content preferences management.
 *
 * **TODO(openapi-regen):** migrate from raw `httpRequest` to `openApiRequest`
 * once the backend swagger decorators expose `PATCH /auth/content-preferences`
 * in `shared/api/generated/openapi.ts`. Blocks the full OpenAPI-first contract
 * coverage tracked in the 2026-04-15 dependency audit (findings on
 * museum/daily-art/lowDataPack using raw httpRequest — this file joins that
 * set as known technical debt).
 */
export const userProfileApi = {
  /**
   * Replaces the user's content preferences with the given set. Empty array
   * clears all preferences. Returns the persisted (deduplicated, canonically
   * ordered) preferences.
   *
   * @param preferences - One or more of 'history', 'technique', 'artist'.
   * @returns The persisted preferences as confirmed by the backend.
   */
  async updateContentPreferences(preferences: ContentPreference[]): Promise<ContentPreference[]> {
    const data = await httpRequest<UpdateContentPreferencesResponse>(
      '/api/auth/content-preferences',
      {
        method: 'PATCH',
        body: { preferences },
      },
    );
    return data.contentPreferences;
  },
};
