const mockOpenApiRequest = jest.fn();
jest.mock('@/shared/api/openapiClient', () => ({
  openApiRequest: (...args: unknown[]) => mockOpenApiRequest(...args),
}));

import { memoryPreferenceApi } from '@/features/settings/infrastructure/memoryPreferenceApi';

describe('memoryPreferenceApi (C1 hexagonal façade)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('get()', () => {
    it('sends GET /api/chat/memory/preference', async () => {
      mockOpenApiRequest.mockResolvedValueOnce({ enabled: true });

      await memoryPreferenceApi.get();

      expect(mockOpenApiRequest).toHaveBeenCalledWith({
        path: '/api/chat/memory/preference',
        method: 'get',
      });
    });

    it('returns the parsed response payload (enabled flag)', async () => {
      mockOpenApiRequest.mockResolvedValueOnce({ enabled: true });

      const result = await memoryPreferenceApi.get();

      expect(result).toEqual({ enabled: true });
    });

    it('propagates errors from the underlying transport', async () => {
      const transportError = new Error('500 server error');
      mockOpenApiRequest.mockRejectedValueOnce(transportError);

      await expect(memoryPreferenceApi.get()).rejects.toBe(transportError);
    });
  });

  describe('update(enabled)', () => {
    it('sends PATCH /api/chat/memory/preference with JSON-stringified { enabled }', async () => {
      mockOpenApiRequest.mockResolvedValueOnce({ enabled: false });

      await memoryPreferenceApi.update(false);

      expect(mockOpenApiRequest).toHaveBeenCalledWith({
        path: '/api/chat/memory/preference',
        method: 'patch',
        json: { enabled: false },
      });
    });

    it('returns the server-confirmed enabled flag', async () => {
      mockOpenApiRequest.mockResolvedValueOnce({ enabled: true });

      const result = await memoryPreferenceApi.update(true);

      expect(result).toEqual({ enabled: true });
    });

    it('propagates errors from the underlying transport', async () => {
      const transportError = new Error('network down');
      mockOpenApiRequest.mockRejectedValueOnce(transportError);

      await expect(memoryPreferenceApi.update(true)).rejects.toBe(transportError);
    });

    it('emits exactly one underlying request per call', async () => {
      mockOpenApiRequest.mockResolvedValueOnce({ enabled: true });

      await memoryPreferenceApi.update(true);

      expect(mockOpenApiRequest).toHaveBeenCalledTimes(1);
    });
  });
});
