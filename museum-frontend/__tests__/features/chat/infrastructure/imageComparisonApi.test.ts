const mockHttpPost = jest.fn();
jest.mock('@/shared/infrastructure/httpClient', () => ({
  httpClient: {
    post: (...args: unknown[]) => mockHttpPost(...args),
  },
}));

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
  });
});
