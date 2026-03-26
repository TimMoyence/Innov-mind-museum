import type { PaginationParams } from '@shared/types/pagination';

// ─── Enums ───

/**
 * Allowed statuses for a review.
 */
export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export const REVIEW_STATUSES: ReviewStatus[] = ['pending', 'approved', 'rejected'];

// ─── Inputs ───

/**
 * Input for creating a new review.
 */
export interface CreateReviewInput {
  userId: number;
  userName: string;
  rating: number;
  comment: string;
}

/**
 * Input for moderating a review (admin action).
 */
export interface ModerateReviewInput {
  reviewId: string;
  status: ReviewStatus;
}

/**
 * Filters for listing reviews with pagination.
 */
export interface ListReviewsFilters {
  status?: ReviewStatus;
  pagination: PaginationParams;
}

// ─── DTOs ───

/**
 * Review data transfer object returned by endpoints.
 */
export interface ReviewDTO {
  id: string;
  userId: number;
  userName: string;
  rating: number;
  comment: string;
  status: string;
  createdAt: string;
}
