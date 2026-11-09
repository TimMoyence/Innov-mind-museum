import { z } from 'zod';

export const exportKindParamSchema = z.object({
  kind: z.enum(['sessions', 'reviews', 'tickets']),
});

export type ExportKindParam = z.infer<typeof exportKindParamSchema>;

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
