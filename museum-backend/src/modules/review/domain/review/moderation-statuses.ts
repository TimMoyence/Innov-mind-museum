import type { ReviewStatus } from '@modules/review/domain/review/review.types';

export const MODERATION_STATUSES = [
  'approved',
  'rejected',
] as const satisfies readonly ReviewStatus[];
