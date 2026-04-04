import '@/__tests__/helpers/test-utils';

const mockOpenApiRequest = jest.fn<Promise<unknown>, [Record<string, unknown>]>();

jest.mock('@/shared/api/openapiClient', () => ({
  openApiRequest: (params: Record<string, unknown>) => mockOpenApiRequest(params),
}));

import { syncKeywords } from '@/features/art-keywords/infrastructure/artKeywordsApi';

describe('artKeywordsApi', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('syncKeywords', () => {
    it('calls GET /api/chat/art-keywords with locale', async () => {
      const response = { keywords: [], syncedAt: '2026-04-04T10:00:00Z' };
      mockOpenApiRequest.mockResolvedValue(response);

      const result = await syncKeywords('fr');

      expect(mockOpenApiRequest).toHaveBeenCalledWith({
        path: '/api/chat/art-keywords',
        method: 'get',
        query: { locale: 'fr', since: undefined },
      });
      expect(result).toEqual(response);
    });

    it('passes since parameter for delta sync', async () => {
      const since = '2026-04-01T00:00:00Z';
      mockOpenApiRequest.mockResolvedValue({ keywords: [], syncedAt: since });

      await syncKeywords('en', since);

      expect(mockOpenApiRequest).toHaveBeenCalledWith(
        expect.objectContaining({ query: { locale: 'en', since } }),
      );
    });
  });
});
