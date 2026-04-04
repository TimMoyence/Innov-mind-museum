import { reviewApi } from '@/features/review/infrastructure/reviewApi';

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
    it('sends POST /api/reviews with rating, comment, and userName', async () => {
      const review = {
        id: 'uuid-1',
        userId: 1,
        userName: 'Alice',
        rating: 5,
        comment: 'Great museum!',
        status: 'pending' as const,
        createdAt: '2026-04-04T10:00:00Z',
      };
      mockOpenApiRequest.mockResolvedValue({ review });

      const result = await reviewApi.submitReview(5, 'Great museum!', 'Alice');

      expect(mockOpenApiRequest).toHaveBeenCalledWith({
        path: '/api/reviews',
        method: 'post',
        body: JSON.stringify({ rating: 5, comment: 'Great museum!', userName: 'Alice' }),
      });
      expect(result.review).toEqual(review);
    });
  });
});
