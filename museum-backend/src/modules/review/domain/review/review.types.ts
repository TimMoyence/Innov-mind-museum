import type { PaginationParams } from '@shared/types/pagination';

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export const REVIEW_STATUSES: ReviewStatus[] = ['pending', 'approved', 'rejected'];

export interface CreateReviewInput {
  userId: number;
  userName: string;
  rating: number;
  comment: string;
}

export interface ModerateReviewInput {
  reviewId: string;
  status: ReviewStatus;
}

export interface ListReviewsFilters {
  status?: ReviewStatus;
  pagination: PaginationParams;
}

export interface ReviewDTO {
  id: string;
  userId: number;
  userName: string;
  rating: number;
  comment: string;
  status: string;
  createdAt: string;
}
