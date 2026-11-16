import { TEXT_LIMITS } from '@musaium/shared';
import { z } from 'zod';

import { MODERATION_STATUSES } from '@modules/review/domain/review/moderation-statuses';
import { textField } from '@shared/validation/text-field';

export const createReviewSchema = z.object({
  rating: z.number().int().min(0).max(10),
  comment: textField(TEXT_LIMITS.reviewComment, { trim: true }),
  sessionId: z.uuid().optional(),
});

export const moderateReviewSchema = z.object({
  status: z.enum(MODERATION_STATUSES),
});

export const listReviewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
