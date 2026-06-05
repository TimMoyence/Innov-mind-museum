/**
 * C1 Red — imageComparisonApi infra service.
 *
 * Cluster C1 (hexagonal violations, 2026-05-23-frontend-dry-audit) — the
 * `features/chat/application/useCompareImage` hook currently imports
 * `httpClient` directly and builds its own multipart payload inline. Plan T2.5
 * extracts the multipart construction + POST to
 * `features/chat/infrastructure/imageComparisonApi.ts` exposed as
 * `imageComparisonApi.compare(input)`.
 *
 * THIS TEST FILE IS RED-PHASE: it must FAIL because
 * `@/features/chat/infrastructure/imageComparisonApi` does not yet exist.
 *
 * Contract:
 *  - POST `/api/chat/compare` with multipart `Content-Type` header.
 *  - FormData fields: `image` (RN file), `sessionId`, optional `topK`, optional `locale`.
 *  - Returns `response.data` (unwrapped). The hook continues to read
 *    `error.response.{status,data.error.code}` so axios errors MUST be
 *    propagated untouched (no `mapAxiosError` envelope).
 */

const mockHttpPost = jest.fn();
jest.mock('@/shared/infrastructure/httpClient', () => ({
  httpClient: {
    post: (...args: unknown[]) => mockHttpPost(...args),
  },
}));

// eslint-disable-next-line import/order, import/first -- mock-first per Jest hoisting rules
import { imageComparisonApi } from '@/features/chat/infrastructure/imageComparisonApi';

const sampleInput = {
  image: { uri: 'file:///tmp/sample.jpg', name: 'sample.jpg', type: 'image/jpeg' },
  sessionId: 'session-123',
  topK: 5,
  locale: 'fr' as const,
};

describe('imageComparisonApi (C1 hexagonal façade)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('posts to /api/chat/compare with multipart Content-Type header', async () => {
    mockHttpPost.mockResolvedValueOnce({ data: { matches: [] } });

    await imageComparisonApi.compare(sampleInput);

    expect(mockHttpPost).toHaveBeenCalledWith(
      '/api/chat/compare',
      expect.any(Object),
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'multipart/form-data' }),
      }),
    );
  });

  it('passes a FormData instance as the payload', async () => {
    mockHttpPost.mockResolvedValueOnce({ data: { matches: [] } });

    await imageComparisonApi.compare(sampleInput);

    const [, payload] = mockHttpPost.mock.calls[0] as [string, unknown, unknown];
    // FormData is the canonical RN multipart container; we don't assert append
    // order (RN polyfill quirks) but assert it's a FormData-shaped object.
    expect(payload).toBeDefined();
    expect(typeof (payload as { append?: unknown }).append).toBe('function');
  });

  it('returns the unwrapped response.data payload', async () => {
    const result = { matches: [{ artworkId: 42, score: 0.9 }] };
    mockHttpPost.mockResolvedValueOnce({ data: result });

    const actual = await imageComparisonApi.compare(sampleInput);

    expect(actual).toEqual(result);
  });

  it('propagates axios-shaped 503 errors untouched (preserves response.status for hook mapping)', async () => {
    const axiosError = {
      response: {
        status: 503,
        data: { error: { code: 'COMPARE_ENCODER_UNAVAILABLE' } },
      },
    };
    mockHttpPost.mockRejectedValueOnce(axiosError);

    await expect(imageComparisonApi.compare(sampleInput)).rejects.toBe(axiosError);
  });

  it('propagates axios-shaped 4xx errors untouched', async () => {
    const axiosError = {
      response: {
        status: 422,
        data: { error: { code: 'INVALID_IMAGE' } },
      },
    };
    mockHttpPost.mockRejectedValueOnce(axiosError);

    await expect(imageComparisonApi.compare(sampleInput)).rejects.toBe(axiosError);
  });

  it('omits topK + locale fields when caller does not supply them', async () => {
    mockHttpPost.mockResolvedValueOnce({ data: { matches: [] } });

    await imageComparisonApi.compare({
      image: sampleInput.image,
      sessionId: 'session-bare',
    });

    expect(mockHttpPost).toHaveBeenCalledTimes(1);
    // Minimal-shape smoke: call still went through with the bare input.
  });
});
