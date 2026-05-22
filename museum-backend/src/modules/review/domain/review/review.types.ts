import type { PaginationParams } from '@shared/types/pagination';

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export const REVIEW_STATUSES: ReviewStatus[] = ['pending', 'approved', 'rejected'];

export interface CreateReviewInput {
  userId: number;
  userName: string;
  rating: number;
  comment: string;
  /** B2B multi-tenant scope (Wave B C7). Null = unscoped/public review. */
  museumId?: number | null;
}

export interface ModerateReviewInput {
  reviewId: string;
  status: ReviewStatus;
}

export interface ListReviewsFilters {
  status?: ReviewStatus;
  /** B2B multi-tenant scope (Wave B C7 / R-C7c). */
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
  /** B2B multi-tenant scope (Wave B C7). Null for unscoped reviews. */
  museumId: number | null;
  createdAt: string;
}

/**
 * Net Promoter Score aggregate (Wave B C7 / R-C7b).
 *
 * NPS = % promoters (rating ∈ [9, 10]) − % detractors (rating ∈ [0, 6]).
 * Range : -100 .. +100. Computed only over `approved` reviews; pending /
 * rejected excluded so moderation policy controls the public score.
 *
 * `count = 0` → `nps = 0` (neutral, no signal) rather than NaN.
 */
export interface NpsAggregate {
  nps: number;
  promoters: number;
  passives: number;
  detractors: number;
  count: number;
}
