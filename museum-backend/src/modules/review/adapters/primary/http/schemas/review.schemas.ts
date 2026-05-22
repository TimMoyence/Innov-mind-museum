import { z } from 'zod';

/**
 * Wave B C7 / R-C7b — rating widened 1-5 → 0-10 (NPS scale).
 *
 * Net Promoter Score endpoints :
 *   - 0  = strongest detractor
 *   - 6  = neutral threshold
 *   - 9-10 = promoters (NPS aggregation : %promoters - %detractors)
 *
 * Back-compat (D8 / Q-C7) : existing 1-5 ratings remain valid; no
 * normalization of historical reviews (seed/demo data, low stakes).
 * Schema widening is an OpenAPI breaking change (acknowledged) — FE types
 * regenerated via `pnpm openapi:validate` + `npm run check:openapi-types`.
 *
 * Spec: design.md §3 Vague B C7, T-B9. Frozen test: `tests/unit/review/review.schema.test.ts`.
 */
export const createReviewSchema = z.object({
  rating: z.number().int().min(0).max(10),
  comment: z.string().min(10).max(2000),
});

export const moderateReviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
});

export const listReviewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
