import { openApiRequest } from '@/shared/api/openapiClient';
import type { components } from '@/shared/api/generated/openapi';

type ReviewDTO = components['schemas']['ReviewDTO'];
type ReviewListResponse = components['schemas']['ReviewListResponse'];
type ReviewStatsResponse = components['schemas']['ReviewStatsResponse'];

export type { ReviewDTO, ReviewListResponse, ReviewStatsResponse };

/** Service for review API operations: list, stats, and submit. */
export const reviewApi = {
  async getReviews(page = 1, limit = 10): Promise<ReviewListResponse> {
    return openApiRequest({
      path: '/api/reviews',
      method: 'get',
      query: { page, limit },
    });
  },

  async getStats(): Promise<ReviewStatsResponse> {
    return openApiRequest({
      path: '/api/reviews/stats',
      method: 'get',
    });
  },

  async submitReview(
    rating: number,
    comment: string,
    userName: string,
  ): Promise<{ review: ReviewDTO }> {
    return openApiRequest({
      path: '/api/reviews',
      method: 'post',
      body: JSON.stringify({ rating, comment, userName }),
    });
  },
};
