import { z } from 'zod';

/**
 * Path parameter schema for the admin CSV export routes (R2 §0.3).
 *
 * `<kind>.csv` is the suffix of every endpoint ; the Zod enum narrows it to
 * exactly the three supported kinds and any other value triggers 400 via
 * the standard `validateQuery` / `validateParams` pipeline.
 */
export const exportKindParamSchema = z.object({
  kind: z.enum(['sessions', 'reviews', 'tickets']),
});

/**
 *
 */
export type ExportKindParam = z.infer<typeof exportKindParamSchema>;

/**
 * Optional query parameters — `?from=YYYY-MM-DD&to=YYYY-MM-DD` (R10 / R11).
 *
 * Accepted shape stays loose for V1 : we ONLY validate the format ; the
 * downstream use case applies the default 365-day window when both are
 * absent (R11). Tightening to a max range would be premature.
 */
export const exportQuerySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD')
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD')
    .optional(),
});

/**
 *
 */
export type ExportQuery = z.infer<typeof exportQuerySchema>;
