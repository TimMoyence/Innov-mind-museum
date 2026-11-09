import { settleWrite } from '@/features/settings/infrastructure/accountPreference';
import {
  openApiRequest,
  openApiRequestField,
  type OpenApiJsonRequestBodyFor,
} from '@/shared/api/openapiClient';
import { CONTENT_PREFERENCES, type ContentPreference } from '@/shared/types/content-preference';

export { CONTENT_PREFERENCES, type ContentPreference };

type UpdateContentPreferencesPayload = OpenApiJsonRequestBodyFor<
  '/api/auth/content-preferences',
  'patch'
>;

type ProfilePreferencesPatch = OpenApiJsonRequestBodyFor<'/api/auth/me/preferences', 'patch'>;

export const saveProfilePreferences = (patch: ProfilePreferencesPatch): Promise<Error | null> =>
  settleWrite(
    openApiRequest({
      path: '/api/auth/me/preferences',
      method: 'patch',
      json: patch,
    }),
    'profilePreferences.save',
  );

export const userProfileApi = {
  async updateContentPreferences(preferences: ContentPreference[]): Promise<ContentPreference[]> {
    const payload: UpdateContentPreferencesPayload = { preferences };
    return openApiRequestField(
      { path: '/api/auth/content-preferences', method: 'patch', json: payload },
      'contentPreferences',
    );
  },
};
