/**
 * C1 Red — memoryPreferenceApi infra service.
 *
 * Cluster C1 (hexagonal violations, 2026-05-23-frontend-dry-audit) — the
 * settings hook `useMemoryPreference` currently imports `openApiRequest` from
 * `@/shared/api/openapiClient` directly (violation: application layer touches
 * a shared transport primitive). The fix is a façade service in
 * `features/settings/infrastructure/memoryPreferenceApi.ts` exposing `get()` /
 * `update(enabled)` that wraps `GET|PATCH /api/chat/memory/preference`.
 *
 * THIS TEST FILE IS RED-PHASE: it must FAIL because
 * `@/features/settings/infrastructure/memoryPreferenceApi` does not yet exist.
 *
 * Pattern source: `__tests__/infrastructure/authApi.test.ts` (canonical infra
 * test). Mocks `openApiRequest` and asserts each method's path/method/body
 * shape + propagates underlying transport errors.
 */

const mockOpenApiRequest = jest.fn();
jest.mock('@/shared/api/openapiClient', () => ({
  openApiRequest: (...args: unknown[]) => mockOpenApiRequest(...args),
}));

// eslint-disable-next-line import/order, import/first -- mock-first per Jest hoisting rules
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
        body: JSON.stringify({ enabled: false }),
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
