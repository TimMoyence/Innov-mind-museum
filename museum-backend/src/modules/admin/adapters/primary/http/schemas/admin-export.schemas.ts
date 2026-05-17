import { z } from 'zod';

/** R2 §0.3 — `<kind>.csv` suffix of every export endpoint. */
export const exportKindParamSchema = z.object({
  kind: z.enum(['sessions', 'reviews', 'tickets']),
});

export type ExportKindParam = z.infer<typeof exportKindParamSchema>;

/** R10/R11 — format only ; use case applies default 365d window when absent. */
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

export type ExportQuery = z.infer<typeof exportQuerySchema>;
