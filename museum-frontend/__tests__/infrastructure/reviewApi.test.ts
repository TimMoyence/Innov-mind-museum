import { reviewApi } from '@/features/review/infrastructure/reviewApi';
import { makeReview } from '../helpers/factories/review.factories';

jest.mock('@/shared/api/openapiClient', () => ({
  openApiRequest: jest.fn(),
}));

import { openApiRequest } from '@/shared/api/openapiClient';
const mockOpenApiRequest = openApiRequest as jest.Mock;

describe('reviewApi', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getReviews', () => {
    it('calls GET /api/reviews with pagination params', async () => {
      mockOpenApiRequest.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      });

      await reviewApi.getReviews(2, 5);

      expect(mockOpenApiRequest).toHaveBeenCalledWith({
        path: '/api/reviews',
        method: 'get',
        query: { page: 2, limit: 5 },
      });
    });

    it('uses default page=1 and limit=10 when not provided', async () => {
      mockOpenApiRequest.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      });

      await reviewApi.getReviews();

      expect(mockOpenApiRequest).toHaveBeenCalledWith({
        path: '/api/reviews',
        method: 'get',
        query: { page: 1, limit: 10 },
      });
    });
  });

  describe('getStats', () => {
    it('calls GET /api/reviews/stats', async () => {
      mockOpenApiRequest.mockResolvedValue({ average: 4.2, count: 15 });

      const result = await reviewApi.getStats();

      expect(mockOpenApiRequest).toHaveBeenCalledWith({
        path: '/api/reviews/stats',
        method: 'get',
      });
      expect(result).toEqual({ average: 4.2, count: 15 });
    });
  });

  describe('submitReview', () => {
    // C2-FE / UFR-022 RED. Contract realigned to the committed BE OpenAPI:
    // POST /api/reviews body = { rating, comment, sessionId? } — `userName` is
    // derived server-side and was dropped from the request body (R18/R23,
    // verified in generated openapi.ts:2112-2123). These tests FAIL at baseline
    // because `reviewApi.submitReview(rating, comment, userName)` still posts
    // `{ rating, comment, userName }` (reviewApi.ts:35).

    it('sends POST /api/reviews with rating and comment but NEVER userName, even with a 3rd arg', async () => {
      const review = makeReview({
        id: 'uuid-1',
        userName: 'Alice',
        rating: 9,
        comment: 'Great museum!',
        status: 'pending',
        createdAt: '2026-04-04T10:00:00Z',
      });
      mockOpenApiRequest.mockResolvedValue({ review });

      // The 3rd positional arg is now `sessionId`, NOT `userName`. At baseline
      // the impl maps it to `userName` in the body — this assertion fails.
      const result = await reviewApi.submitReview(
        9,
        'Great museum!',
        '99999999-8888-7777-6666-555555555555',
      );

      expect(mockOpenApiRequest).toHaveBeenCalledTimes(1);
      const call = mockOpenApiRequest.mock.calls[0][0] as {
        path: string;
        method: string;
        body: string;
      };
      expect(call.path).toBe('/api/reviews');
      expect(call.method).toBe('post');
      const body = JSON.parse(call.body) as Record<string, unknown>;
      expect(body).not.toHaveProperty('userName');
      expect(body).toMatchObject({ rating: 9, comment: 'Great museum!' });
      expect(result.review).toEqual(review);
    });

    it('includes sessionId in the body when provided', async () => {
      const review = makeReview({ rating: 10, comment: 'Loved it' });
      mockOpenApiRequest.mockResolvedValue({ review });
      const sessionId = '11111111-2222-3333-4444-555555555555';

      await reviewApi.submitReview(10, 'Loved it', sessionId);

      const call = mockOpenApiRequest.mock.calls[0][0] as { body: string };
      const body = JSON.parse(call.body) as Record<string, unknown>;
      expect(body).toMatchObject({ rating: 10, comment: 'Loved it', sessionId });
      expect(body).not.toHaveProperty('userName');
    });

    it('omits sessionId from the body when not provided', async () => {
      const review = makeReview({ rating: 0, comment: 'Not for me' });
      mockOpenApiRequest.mockResolvedValue({ review });

      await reviewApi.submitReview(0, 'Not for me');

      const call = mockOpenApiRequest.mock.calls[0][0] as { body: string };
      const body = JSON.parse(call.body) as Record<string, unknown>;
      expect(body).not.toHaveProperty('sessionId');
      expect(body).not.toHaveProperty('userName');
    });
  });
});
