import {
  openApiRequest,
  type OpenApiJsonRequestBodyFor,
  type OpenApiResponseFor,
} from '@/shared/api/openapiClient';
import { CONTENT_PREFERENCES, type ContentPreference } from '@/shared/types/content-preference';

// Re-export to preserve the existing import paths across the app.
// New code should import directly from '@/shared/types/content-preference'.
export { CONTENT_PREFERENCES, type ContentPreference };

type UpdateContentPreferencesPayload = OpenApiJsonRequestBodyFor<
  '/api/auth/content-preferences',
  'patch'
>;
type UpdateContentPreferencesResponse = OpenApiResponseFor<
  '/api/auth/content-preferences',
  'patch'
>;

export const userProfileApi = {
  /**
   * Replaces the user's content preferences with the given set. Empty array
   * clears all preferences. Returns the persisted (deduplicated, canonically
   * ordered) preferences.
   *
   * @param preferences - One or more of 'history', 'technique', 'artist'.
   * @returns The persisted preferences confirmed by the backend.
   */
  async updateContentPreferences(preferences: ContentPreference[]): Promise<ContentPreference[]> {
    const payload: UpdateContentPreferencesPayload = { preferences };
    const data: UpdateContentPreferencesResponse = await openApiRequest({
      path: '/api/auth/content-preferences',
      method: 'patch',
      body: JSON.stringify(payload),
    });
    return data.contentPreferences;
  },
};
