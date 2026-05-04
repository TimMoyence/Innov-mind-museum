import type { Review } from '@modules/review/domain/review/review.entity';

/**
 * Creates a Review entity with sensible defaults. Override any field via `overrides`.
 * @param overrides
 */
export const makeReview = (overrides: Partial<Review> = {}): Review =>
  ({
    id: 'review-001',
    userId: 1,
    userName: 'Test User',
    rating: 4,
    comment: 'Great app!',
    status: 'pending',
    createdAt: new Date('2025-06-01'),
    updatedAt: new Date('2025-06-01'),
    ...overrides,
  }) as Review;
