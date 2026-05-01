import type { components } from '@/shared/api/generated/openapi';

type ReviewDTO = components['schemas']['ReviewDTO'];

/** Creates a ReviewDTO with sensible defaults. Override any field via overrides. */
export function makeReview(overrides: Partial<ReviewDTO> = {}): ReviewDTO {
  return {
    id: '1',
    userId: 1,
    userName: 'Alice',
    rating: 5,
    comment: 'Great!',
    status: 'approved',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}
