import type { PaginationParams } from '@shared/types/pagination';

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export const REVIEW_STATUSES: ReviewStatus[] = ['pending', 'approved', 'rejected'];

export interface CreateReviewInput {
  userId: number;
  userName: string;
  rating: number;
  comment: string;
  museumId?: number | null;
  sessionId?: string | null;
}

export interface ModerateReviewInput {
  reviewId: string;
  status: ReviewStatus;
}

export interface ListReviewsFilters {
  status?: ReviewStatus;
  museumId?: number | null;
  pagination: PaginationParams;
}

export interface ReviewDTO {
  id: string;
  userId: number;
  userName: string;
  rating: number;
  comment: string;
  status: string;
  museumId: number | null;
  createdAt: string;
}

export interface NpsAggregate {
  nps: number;
  promoters: number;
  passives: number;
  detractors: number;
  count: number;
}
