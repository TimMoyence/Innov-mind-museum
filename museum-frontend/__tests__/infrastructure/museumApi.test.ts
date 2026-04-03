import { museumApi } from '@/features/museum/infrastructure/museumApi';

jest.mock('@/shared/api/httpRequest', () => ({
  httpRequest: jest.fn(),
}));

import { httpRequest } from '@/shared/api/httpRequest';
const mockHttpRequest = httpRequest as jest.Mock;

describe('museumApi', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('listMuseumDirectory', () => {
    it('calls GET /api/museums/directory and returns museums array', async () => {
      const museums = [
        {
          id: 1,
          name: 'Louvre',
          slug: 'louvre',
          address: 'Paris',
          description: null,
          latitude: 48.86,
          longitude: 2.33,
        },
      ];
      mockHttpRequest.mockResolvedValue({ museums });

      const result = await museumApi.listMuseumDirectory();

      expect(mockHttpRequest).toHaveBeenCalledWith('/api/museums/directory', { method: 'GET' });
      expect(result).toEqual(museums);
    });
  });

  describe('getMuseum', () => {
    it('calls GET /api/museums/:idOrSlug with encoded param', async () => {
      const museum = {
        id: 1,
        name: 'Louvre',
        slug: 'louvre',
        address: 'Paris',
        description: null,
        latitude: 48.86,
        longitude: 2.33,
        config: {},
        isActive: true,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      };
      mockHttpRequest.mockResolvedValue({ museum });

      const result = await museumApi.getMuseum('louvre');

      expect(mockHttpRequest).toHaveBeenCalledWith('/api/museums/louvre', { method: 'GET' });
      expect(result.name).toBe('Louvre');
    });

    it('encodes special characters in idOrSlug', async () => {
      mockHttpRequest.mockResolvedValue({ museum: { name: 'Test' } });

      await museumApi.getMuseum('my museum');

      expect(mockHttpRequest).toHaveBeenCalledWith('/api/museums/my%20museum', { method: 'GET' });
    });
  });

  describe('searchMuseums', () => {
    it('builds query params from search parameters', async () => {
      mockHttpRequest.mockResolvedValue({ museums: [], count: 0 });

      await museumApi.searchMuseums({ lat: 48.86, lng: 2.33, radius: 5000, q: 'louvre' });

      const calledUrl = mockHttpRequest.mock.calls[0][0] as string;
      expect(calledUrl).toContain('/api/museums/search?');
      expect(calledUrl).toContain('lat=48.86');
      expect(calledUrl).toContain('lng=2.33');
      expect(calledUrl).toContain('radius=5000');
      expect(calledUrl).toContain('q=louvre');
    });

    it('omits optional params when not provided', async () => {
      mockHttpRequest.mockResolvedValue({ museums: [], count: 0 });

      await museumApi.searchMuseums({});

      const calledUrl = mockHttpRequest.mock.calls[0][0] as string;
      expect(calledUrl).toBe('/api/museums/search?');
    });

    it('returns museums and count from response', async () => {
      const museums = [
        {
          name: 'Louvre',
          address: 'Paris',
          latitude: 48.86,
          longitude: 2.33,
          distance: 100,
          source: 'local' as const,
        },
      ];
      mockHttpRequest.mockResolvedValue({ museums, count: 1 });

      const result = await museumApi.searchMuseums({ lat: 48.86, lng: 2.33 });

      expect(result.museums).toEqual(museums);
      expect(result.count).toBe(1);
    });
  });
});
