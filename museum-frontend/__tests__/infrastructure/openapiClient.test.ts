const mockHttpRequest = jest.fn();

jest.mock('@/shared/api/httpRequest', () => ({
  httpRequest: (...args: unknown[]) => mockHttpRequest(...args),
}));

import { formatOpenApiPath, openApiRequest } from '@/shared/api/openapiClient';

describe('openapiClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('formatOpenApiPath', () => {
    it('replaces {id} parameter', () => {
      const result = formatOpenApiPath('/api/chat/sessions/{id}' as never, { id: '42' } as never);
      expect(result).toBe('/api/chat/sessions/42');
    });

    it('throws on missing path parameter', () => {
      expect(() => formatOpenApiPath('/api/chat/sessions/{id}' as never)).toThrow(
        'Missing path param: id',
      );
    });

    it('URI-encodes parameter values', () => {
      const result = formatOpenApiPath(
        '/api/items/{name}' as never,
        { name: 'hello world' } as never,
      );
      expect(result).toBe('/api/items/hello%20world');
    });
  });

  describe('appendQuery (via openApiRequest)', () => {
    it('appends query parameters to URL', async () => {
      mockHttpRequest.mockResolvedValue({ items: [] });

      await openApiRequest({
        path: '/api/auth/me' as never,
        method: 'get' as never,
        query: { page: 1, limit: 10 },
      });

      const url = mockHttpRequest.mock.calls[0][0] as string;
      expect(url).toContain('page=1');
      expect(url).toContain('limit=10');
    });

    it('skips null/undefined query values', async () => {
      mockHttpRequest.mockResolvedValue({});

      await openApiRequest({
        path: '/api/auth/me' as never,
        method: 'get' as never,
        query: { active: true, deleted: null, archived: undefined },
      });

      const url = mockHttpRequest.mock.calls[0][0] as string;
      expect(url).toContain('active=true');
      expect(url).not.toContain('deleted');
      expect(url).not.toContain('archived');
    });
  });

  describe('openApiRequest', () => {
    it('delegates to httpRequest with correct URL and method', async () => {
      const responseData = { id: 1, email: 'test@test.com' };
      mockHttpRequest.mockResolvedValue(responseData);

      const result = await openApiRequest({
        path: '/api/auth/me' as never,
        method: 'get' as never,
      });

      expect(mockHttpRequest).toHaveBeenCalledWith('/api/auth/me', {
        method: 'GET',
        body: undefined,
        headers: undefined,
        requiresAuth: undefined,
      });
      expect(result).toEqual(responseData);
    });

    it('passes body and headers to httpRequest', async () => {
      mockHttpRequest.mockResolvedValue({});

      await openApiRequest({
        path: '/api/auth/login' as never,
        method: 'post' as never,
        body: '{"email":"a@b.com"}',
        headers: { 'X-Custom': 'value' },
        requiresAuth: false,
      });

      expect(mockHttpRequest).toHaveBeenCalledWith('/api/auth/login', {
        method: 'POST',
        body: '{"email":"a@b.com"}',
        headers: { 'X-Custom': 'value' },
        requiresAuth: false,
      });
    });
  });
});
