import { httpClient } from '@/shared/infrastructure/httpClient';
import { appendRnFile } from '@/features/chat/infrastructure/chatApi/_internals';
import type { components } from '@/shared/api/generated/openapi';

export type CompareResult = components['schemas']['CompareResult'];

export interface CompareInput {
  image: { uri: string; name: string; type: string };
  sessionId: string;
  topK?: number;
  locale?: 'fr' | 'en';
}

const COMPARE_ENDPOINT = '/api/chat/compare';

export const imageComparisonApi = {
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
