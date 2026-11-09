import { openApiRequest } from '@/shared/api/openapiClient';
import type { components } from '@/shared/api/generated/openapi';

type ReviewDTO = components['schemas']['ReviewDTO'];
type ReviewListResponse = components['schemas']['ReviewListResponse'];
type ReviewStatsResponse = components['schemas']['ReviewStatsResponse'];

export type { ReviewDTO, ReviewListResponse, ReviewStatsResponse };

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
    sessionId?: string,
  ): Promise<{ review: ReviewDTO }> {
    const body = sessionId !== undefined ? { rating, comment, sessionId } : { rating, comment };
    return openApiRequest({
      path: '/api/reviews',
      method: 'post',
      json: body,
    });
  },
};
