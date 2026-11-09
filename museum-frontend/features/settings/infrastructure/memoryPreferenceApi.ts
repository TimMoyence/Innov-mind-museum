import { openApiRequest, type OpenApiJsonRequestBodyFor } from '@/shared/api/openapiClient';
import type { paths } from '@/shared/api/generated/openapi';

type GetResponse =
  paths['/api/chat/memory/preference']['get']['responses'][200]['content']['application/json'];
type PatchResponse =
  paths['/api/chat/memory/preference']['patch']['responses'][200]['content']['application/json'];
type PatchBody = OpenApiJsonRequestBodyFor<'/api/chat/memory/preference', 'patch'>;

export const memoryPreferenceApi = {
  async get(): Promise<GetResponse> {
    return openApiRequest({
      path: '/api/chat/memory/preference',
      method: 'get',
    });
  },

  async update(enabled: boolean): Promise<PatchResponse> {
    const body: PatchBody = { enabled };
    return openApiRequest({
      path: '/api/chat/memory/preference',
      method: 'patch',
      json: body,
    });
  },
};
