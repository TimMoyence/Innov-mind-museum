import { z } from 'zod';

export const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(10).max(2000),
  userName: z.string().min(1).max(128),
});

export const moderateReviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
});
